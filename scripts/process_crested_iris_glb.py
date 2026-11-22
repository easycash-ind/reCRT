"""
Blender 5.1 离线几何与全息薄膜干涉属性烘焙管线：蝴蝶花 (Crested Iris, Iris japonica)
运行方式：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/process_crested_iris_glb.py
"""

import heapq
import math
import os
import bpy
from mathutils import Euler, Vector
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INPUT_GLB = os.path.join(
    PROJECT_ROOT, "public", "scan-glb", "cc0__crested_iris_iris_japonica.glb"
)
OUTPUT_GLB = os.path.join(
    PROJECT_ROOT, "public", "scan-glb", "crested_iris_holo_ready.glb"
)


def compute_geodesic_and_curvature(
    mesh, gltf_pos: np.ndarray, gltf_norm: np.ndarray, is_stem: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """计算：1) 自底部花梗向花瓣尖端传导的测地线距离 [0, 1]；2) 二阶拉普拉斯曲率脊谷 [0, 1]。"""
    num_verts = len(mesh.vertices)
    adj = [[] for _ in range(num_verts)]
    nbr_list = [[] for _ in range(num_verts)]
    for edge in mesh.edges:
        u, v = edge.vertices[0], edge.vertices[1]
        nbr_list[u].append(v)
        nbr_list[v].append(u)
        dist = float(np.linalg.norm(gltf_pos[u] - gltf_pos[v]))
        if dist > 1e-7:
            adj[u].append((v, dist))
            adj[v].append((u, dist))

    nbr_mean = np.copy(gltf_pos)
    for _ in range(2):
        next_mean = np.copy(nbr_mean)
        for i in range(num_verts):
            if nbr_list[i]:
                next_mean[i] = nbr_mean[nbr_list[i]].mean(axis=0)
        nbr_mean = next_mean

    lap_disp = np.sum((gltf_pos - nbr_mean) * gltf_norm, axis=1)
    ridge_norm = np.clip(0.5 + lap_disp * 6.5, 0.0, 1.0).astype(np.float32)

    min_y = float(gltf_pos[:, 1].min())
    root_seeds = np.where(is_stem & (gltf_pos[:, 1] <= min_y + 0.35))[0]
    if len(root_seeds) < 8:
        root_seeds = np.argsort(gltf_pos[:, 1])[: max(16, num_verts // 200)]

    INF = 1e9
    g_dist = np.full(num_verts, INF, dtype=np.float64)
    pq = []
    for idx in root_seeds:
        idx_int = int(idx)
        g_dist[idx_int] = 0.0
        heapq.heappush(pq, (0.0, idx_int))

    while pq:
        d, u = heapq.heappop(pq)
        if d > g_dist[u]:
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < g_dist[v]:
                g_dist[v] = nd
                heapq.heappush(pq, (nd, v))

    reachable = g_dist < (INF * 0.5)
    max_reach = float(g_dist[reachable].max()) if np.any(reachable) else 1.0
    max_reach = max(max_reach, 1e-5)

    norm_dist = np.zeros(num_verts, dtype=np.float32)
    norm_dist[reachable] = np.clip(g_dist[reachable] / max_reach, 0.0, 1.0)
    if not np.all(reachable):
        y_span = max(float(gltf_pos[:, 1].max() - min_y), 1e-5)
        norm_dist[~reachable] = np.clip(
            (gltf_pos[~reachable, 1] - min_y) / y_span, 0.0, 1.0
        )

    return norm_dist, ridge_norm


def main():
    print(f"[CrestedIrisPipeline] Loading source GLB: {INPUT_GLB}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=INPUT_GLB)

    for obj in list(bpy.data.objects):
        if obj.type == "MESH":
            mats = [m.name for m in obj.data.materials]
            if "QS1508-W03-3-1" not in mats:
                bpy.data.objects.remove(obj, do_unlink=True)

    mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in mesh_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objs[0]
    bpy.ops.object.join()

    main_obj = bpy.context.view_layer.objects.active
    main_obj.name = "CrestedIrisSpecimenMain"
    main_obj.data.name = "CrestedIrisSpecimenMainMesh"

    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    for obj in list(bpy.data.objects):
        if obj != main_obj:
            bpy.data.objects.remove(obj, do_unlink=True)

    # 校准主花最佳观赏姿态：外花被片左右水平展开、中央鸡冠流苏直立向上
    target = Vector((0.062, 0.0, 0.035))
    az = math.radians(-58.0)
    el = math.radians(28.0)
    dist = 0.25
    eye = target + Vector(
        (
            dist * math.cos(el) * math.cos(az),
            dist * math.cos(el) * math.sin(az),
            dist * math.sin(el),
        )
    )
    direction = target - eye
    r_cam = direction.to_track_quat("-Z", "Y").to_matrix()
    r_roll = Euler((0, 0, math.radians(-10.0)), "XYZ").to_matrix()
    r_front = Euler((math.radians(90), 0, 0), "XYZ").to_matrix()
    align_mat = (r_front @ r_roll @ r_cam.inverted()).to_4x4()

    mesh = main_obj.data
    mesh.transform(align_mat)
    mesh.update()

    for attr in list(mesh.attributes):
        if attr.data_type in ("FLOAT_COLOR", "BYTE_COLOR") or attr.name.startswith(
            "COLOR"
        ):
            mesh.attributes.remove(attr)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.00002)
    bpy.ops.object.mode_set(mode="OBJECT")

    dec_mod = main_obj.modifiers.new(name="IrisDecimate", type="DECIMATE")
    dec_mod.decimate_type = "COLLAPSE"
    dec_mod.ratio = 0.115
    dec_mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=dec_mod.name)

    # 归一化尺寸，并将底部倾斜的花梗自然扶正至画面底部中央 (x ≈ 0)，贴合参考图构图
    verts_co = np.array([v.co[:] for v in mesh.vertices], dtype=np.float32)
    min_co = verts_co.min(axis=0)
    max_co = verts_co.max(axis=0)
    center_co = (min_co + max_co) * 0.5
    span = float((max_co - min_co).max())
    target_span = 5.4
    scale_factor = target_span / max(span, 1e-5)

    for v in mesh.vertices:
        nx = (v.co.x - center_co[0]) * scale_factor
        ny = (v.co.y - center_co[1]) * scale_factor
        nz = (v.co.z - center_co[2]) * scale_factor
        # 在 Blender 坐标系中 +Z 对应 glTF +Y（高度），-Y 对应 glTF +Z（朝向摄像机）
        # 1) 将底部花梗顺滑向中央垂直轴收拢
        if nz < 0.15:
            t_stem = min(max((0.15 - nz) / 2.65, 0.0), 1.0)
            smooth_t = 0.45 * t_stem + 0.55 * (t_stem * t_stem * (3.0 - 2.0 * t_stem))
            nx -= smooth_t * 0.78

        # 2) 以花托喉部 (nz = -0.22) 为支点，将上方花冠向摄像机方向 (-Y) 前倾 25°，使花盘自然正面朝向镜头
        hinge_z = -0.22
        if nz > hinge_z - 0.30:
            t_tilt = min(max((nz - (hinge_z - 0.30)) / 0.65, 0.0), 1.0)
            smooth_tilt = t_tilt * t_tilt * (3.0 - 2.0 * t_tilt)
            angle = math.radians(25.0) * smooth_tilt
            dz = nz - hinge_z
            dy = ny
            cos_a = math.cos(angle)
            sin_a = math.sin(angle)
            ny = dy * cos_a - dz * sin_a
            nz = hinge_z + dy * sin_a + dz * cos_a

        v.co.x = nx - 0.04
        v.co.y = ny
        v.co.z = nz - 0.28

    mesh.validate()
    mesh.update()
    bpy.ops.object.shade_smooth()

    iris_img = None
    for m in mesh.materials:
        if m and m.node_tree:
            tn = next((n for n in m.node_tree.nodes if n.type == "TEX_IMAGE"), None)
            if tn and tn.image:
                iris_img = tn.image
                break
    if iris_img is None:
        iris_img = bpy.data.images[-1]

    w, h = iris_img.size
    pixels = np.array(iris_img.pixels[:], dtype=np.float32).reshape((h, w, 4))

    num_verts = len(mesh.vertices)
    vert_rgb_sum = np.zeros((num_verts, 3), dtype=np.float32)
    vert_rgb_cnt = np.zeros(num_verts, dtype=np.float32)

    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            uv = uv_layer[li].uv
            px = min(max(int(float(uv.x % 1.0) * w), 0), w - 1)
            py = min(max(int(float(uv.y % 1.0) * h), 0), h - 1)
            vert_rgb_sum[vi] += pixels[py, px, :3]
            vert_rgb_cnt[vi] += 1.0

    vert_rgb = vert_rgb_sum / np.maximum(vert_rgb_cnt[:, None], 1.0)
    verts_blender = np.array([v.co[:] for v in mesh.vertices], dtype=np.float32)
    norms_blender = np.array([v.normal[:] for v in mesh.vertices], dtype=np.float32)

    # Blender (bx, by, bz) -> glTF (+X, +Z, -Y)
    gltf_pos = np.stack(
        [verts_blender[:, 0], verts_blender[:, 2], -verts_blender[:, 1]], axis=1
    )
    gltf_norm = np.stack(
        [norms_blender[:, 0], norms_blender[:, 2], -norms_blender[:, 1]], axis=1
    )

    r_ch, g_ch, b_ch = vert_rgb[:, 0], vert_rgb[:, 1], vert_rgb[:, 2]

    # 识别四类解剖区域（严格限制花茎在中央花梗柱面内，避免前倾后下垂的前花瓣尖端被误判为花茎）：
    in_stem_column = (np.abs(gltf_pos[:, 0]) < 0.42) & (gltf_pos[:, 2] < 0.32)
    is_stem = in_stem_column & (
        ((g_ch > b_ch * 1.15) & (g_ch > r_ch * 0.90) & (gltf_pos[:, 1] < 0.05))
        | (gltf_pos[:, 1] < -0.78)
    )
    is_orange_crest = (
        (~is_stem) & (r_ch > g_ch * 1.20) & (g_ch > b_ch * 1.18) & (r_ch > 0.32)
    )
    # 中央高耸的流苏状花柱分枝顶端同样赋予暖金/虹彩核心权重
    radial_xy = np.hypot(gltf_pos[:, 0], gltf_pos[:, 2] - 0.15)
    is_central_crown = (~is_stem) & (gltf_pos[:, 1] > 0.72) & (radial_xy < 0.95)
    is_violet_spot = (
        (~is_stem)
        & (~is_orange_crest)
        & (b_ch > g_ch * 1.10)
        & (r_ch > g_ch * 1.03)
    )

    organ_semantic = np.full(num_verts, 0.45, dtype=np.float32)
    organ_semantic[is_stem] = 0.0
    organ_semantic[is_violet_spot] = 0.75
    organ_semantic[is_central_crown] = 0.88
    organ_semantic[is_orange_crest] = 1.0

    # 1. R通道：维管束测地线距离 [0, 1] 与二阶曲率 [0, 1]
    geodesic_dist, ridge_norm = compute_geodesic_and_curvature(
        mesh, gltf_pos, gltf_norm, is_stem
    )

    # 2. B通道：花瓣方位流线相位 (Flow Coordinate [0, 1])，用于生成平滑连续的表面纵向与等高流线
    azimuth = (np.arctan2(gltf_pos[:, 2], gltf_pos[:, 0]) + math.pi) / (2.0 * math.pi)
    flow_coord = np.mod(azimuth * 3.0 + geodesic_dist * 0.15, 1.0).astype(np.float32)

    # 3. A通道：曲率脊线与薄膜光学厚度综合权重 [0.05, 0.99]
    tex_luma = 0.299 * r_ch + 0.587 * g_ch + 0.114 * b_ch
    thickness_weight = np.clip(
        0.52 * ridge_norm + 0.30 * (1.0 - tex_luma) + 0.18 * geodesic_dist,
        0.05,
        0.99,
    ).astype(np.float32)

    meta_attr = mesh.attributes.new(
        name="_IRIS_META", type="BYTE_COLOR", domain="POINT"
    )
    rgba_flat = np.stack(
        [geodesic_dist, organ_semantic, flow_coord, thickness_weight], axis=1
    ).reshape(-1)
    meta_attr.data.foreach_set("color", rgba_flat)

    mat = bpy.data.materials.new(name="CrestedIrisHoloMaterial")
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out_node = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf_node = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf_node.inputs["Roughness"].default_value = 0.25
    bsdf_node.inputs["Metallic"].default_value = 0.05

    tex_node = nodes.new(type="ShaderNodeTexImage")
    tex_node.image = iris_img

    links.new(tex_node.outputs["Color"], bsdf_node.inputs["Base Color"])
    links.new(bsdf_node.outputs["BSDF"], out_node.inputs["Surface"])

    mesh.materials.clear()
    mesh.materials.append(mat)

    for img in list(bpy.data.images):
        if img != iris_img:
            bpy.data.images.remove(img)

    os.makedirs(os.path.dirname(OUTPUT_GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=OUTPUT_GLB,
        export_format="GLB",
        export_attributes=True,
        export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=False,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=88,
    )

    out_size_mb = os.path.getsize(OUTPUT_GLB) / (1024 * 1024)
    print(
        f"[CrestedIrisPipeline] Exported: {OUTPUT_GLB} ({out_size_mb:.2f} MB), verts={num_verts}"
    )
    print(
        f"[CrestedIrisPipeline] Organs -> stem={int(is_stem.sum())}, violet={int(is_violet_spot.sum())}, crest={int(is_orange_crest.sum())}, crown={int(is_central_crown.sum())}"
    )


if __name__ == "__main__":
    main()
