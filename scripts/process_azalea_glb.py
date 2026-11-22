"""
Blender 5.1 离线几何与植物生物电高对比结构烘焙管线：大紫杜鹃 (Oomurasaki Azalea, Rhododendron x pulchrum)
运行方式：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/process_azalea_glb.py
"""

import heapq
import math
import os
import bpy
from mathutils import Euler, Vector
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INPUT_GLB = os.path.join(
    PROJECT_ROOT, "public", "scan-glb", "cc0__oomurasaki_azalea_r._x_pulchrum.glb"
)
OUTPUT_GLB = os.path.join(
    PROJECT_ROOT, "public", "scan-glb", "oomurasaki_azalea_ascii_ready.glb"
)


def compute_geodesic_and_curvature(
    mesh, gltf_pos: np.ndarray, gltf_norm: np.ndarray, is_petal: np.ndarray
) -> tuple[np.ndarray, np.ndarray]:
    """基于网格边邻接图计算：1) 自左下枝干根部向花瓣尖端传导的测地线距离 [0, 1]；2) 二阶拉普拉斯曲率脊谷 [-1, 1]。"""
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

    # 二阶拉普拉斯曲率：识别花瓣折痕暗谷 (<0) 与凸起花蕊/中脉 (>0)
    nbr_mean = np.copy(gltf_pos)
    for _ in range(2):
        next_mean = np.copy(nbr_mean)
        for i in range(num_verts):
            if nbr_list[i]:
                next_mean[i] = nbr_mean[nbr_list[i]].mean(axis=0)
        nbr_mean = next_mean

    lap_disp = np.sum((gltf_pos - nbr_mean) * gltf_norm, axis=1)
    ridge_factor = np.clip(lap_disp * 9.0, -1.0, 1.0).astype(np.float32)

    # 选取左下角木质枝干断口顶点作为生物电起搏注入源
    stem_score = gltf_pos[:, 0] * 0.65 + gltf_pos[:, 1] * 0.75
    min_score = float(stem_score.min())
    root_seeds = np.where((~is_petal) & (stem_score <= min_score + 0.38))[0]
    if len(root_seeds) < 8:
        root_seeds = np.argsort(stem_score)[: max(12, num_verts // 200)]

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
        span = max(float(stem_score.max() - min_score), 1e-5)
        norm_dist[~reachable] = np.clip(
            (stem_score[~reachable] - min_score) / span, 0.0, 1.0
        )

    return norm_dist, ridge_factor


def main():
    print(f"[AzaleaBioPipeline] Loading source GLB: {INPUT_GLB}")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=INPUT_GLB)

    for obj in list(bpy.data.objects):
        if obj.name in ("Object_4", "_Cube_0") or (
            obj.type == "MESH" and len(obj.data.vertices) < 100
        ):
            bpy.data.objects.remove(obj, do_unlink=True)

    mesh_objs = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in mesh_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objs[0]
    bpy.ops.object.join()

    main_obj = bpy.context.view_layer.objects.active
    main_obj.name = "AzaleaSpecimenMain"
    main_obj.data.name = "AzaleaSpecimenMainMesh"

    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    for obj in list(bpy.data.objects):
        if obj != main_obj:
            bpy.data.objects.remove(obj, do_unlink=True)

    # 将最佳观赏视角（左下露出木质枝干与翠绿叶片、左前五瓣大紫杜鹃正面盛放、右侧喇叭花舒展）精确对齐至 glTF +Z 正面
    eye = Vector((-6.35, -1.45, 3.15))
    target = Vector((0.0, 0.0, 0.28))
    direction = target - eye
    r_cam = direction.to_track_quat("-Z", "Y").to_matrix()
    r_front = Euler((math.radians(90), 0, 0), "XYZ").to_matrix()
    align_mat = (r_front @ r_cam.inverted()).to_4x4()

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

    dec_mod = main_obj.modifiers.new(name="AsciiDecimate", type="DECIMATE")
    dec_mod.decimate_type = "COLLAPSE"
    dec_mod.ratio = 0.028
    dec_mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=dec_mod.name)

    verts_co = np.array([v.co[:] for v in mesh.vertices], dtype=np.float32)
    min_co = verts_co.min(axis=0)
    max_co = verts_co.max(axis=0)
    center_co = (min_co + max_co) * 0.5
    span = float((max_co - min_co).max())
    target_span = 5.0
    scale_factor = target_span / max(span, 1e-5)

    for v in mesh.vertices:
        v.co.x = (v.co.x - center_co[0]) * scale_factor
        v.co.y = (v.co.y - center_co[1]) * scale_factor
        v.co.z = (v.co.z - center_co[2]) * scale_factor

    mesh.validate()
    mesh.update()
    bpy.ops.object.shade_smooth()

    azalea_img = None
    for img in bpy.data.images:
        if img.size[0] >= 512 and img.name != "Image_0":
            azalea_img = img
            break
    if azalea_img is None:
        azalea_img = bpy.data.images[0]

    w, h = azalea_img.size
    pixels = np.array(azalea_img.pixels[:], dtype=np.float32).reshape((h, w, 4))

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
    tex_luma = 0.299 * r_ch + 0.587 * g_ch + 0.114 * b_ch

    # 精确识别三类器官：紫红杜鹃花瓣 (B > G, 1.0) / 橄榄翠绿叶片与花萼 (G > B * 1.18, 0.5) / 木质枝干与芽鳞 (0.0)
    is_petal = (r_ch > 0.34) & (b_ch > g_ch * 1.02) & (r_ch > g_ch * 1.25)
    is_leaf = (~is_petal) & (g_ch > b_ch * 1.18) & (g_ch > 0.12)

    organ_semantic = np.zeros(num_verts, dtype=np.float32)
    organ_semantic[is_leaf] = 0.5
    organ_semantic[is_petal] = 1.0

    # 1. R通道：维管束测地线距离 [0, 1] 与二阶拉普拉斯曲率脊谷 [-1, 1]
    geodesic_dist, ridge_factor = compute_geodesic_and_curvature(
        mesh, gltf_pos, gltf_norm, is_petal
    )

    # 三朵大紫杜鹃在对齐后 glTF 空间中的花冠中心与深陷花喉中心：
    # Flower 0: 左前正面盛放五瓣主花 (Hero Blossom)
    # Flower 1: 中上后排背景花冠
    # Flower 2: 右侧斜展喇叭花冠
    flower_centers = np.array(
        [
            [-0.82, -0.12, 0.68],
            [-0.02, 0.78, 0.10],
            [1.25, 0.18, 0.05],
        ],
        dtype=np.float32,
    )
    throat_centers = np.array(
        [
            [-0.74, -0.15, 0.48],
            [-0.02, 0.52, -0.05],
            [0.85, 0.02, -0.10],
        ],
        dtype=np.float32,
    )

    dists_to_flowers = np.linalg.norm(
        gltf_pos[:, None, :] - flower_centers[None, :, :], axis=2
    )
    sorted_dists = np.sort(dists_to_flowers, axis=1)
    nearest_flower = np.argmin(dists_to_flowers, axis=1)

    # 花朵与花朵交界处的暗部隔离沟 (Inter-Flower Boundary Moat)：彻底杜绝三朵花粘连成一团
    flower_margin = sorted_dists[:, 1] - sorted_dists[:, 0]
    inter_flower_moat = np.clip((flower_margin - 0.05) / 0.28, 0.18, 1.0)

    # 前后景花朵明暗层级：左前主花 (1.00) > 右侧喇叭花 (0.82) > 中上背花 (0.60)
    flower_layer_weight = np.where(
        nearest_flower == 0, 1.00, np.where(nearest_flower == 2, 0.82, 0.60)
    ).astype(np.float32)

    # 花心深邃漏斗遮蔽 (Throat Funnel Cavity AO)：让每朵花中心形成清晰的深暗漏斗核心
    throat_vecs = gltf_pos - throat_centers[nearest_flower]
    throat_rad = np.linalg.norm(throat_vecs, axis=1)
    throat_cavity = np.clip((throat_rad - 0.16) / 0.46, 0.10, 1.0)

    # 左前主花的真实 5 瓣缝合暗槽 (-132°, -52°, +18°, +92°, +158°) 与 5 道中央生物电主脉
    dx0 = gltf_pos[:, 0] - throat_centers[0, 0]
    dy0 = gltf_pos[:, 1] - throat_centers[0, 1]
    ang0 = np.degrees(np.arctan2(dy0, dx0))
    rad0 = np.hypot(dx0, dy0)

    cleft_degs = np.array([-132.0, -52.0, 18.0, 92.0, 158.0], dtype=np.float32)
    vein_degs = np.array([-172.0, -95.0, -15.0, 52.0, 122.0], dtype=np.float32)

    ang_diff_cleft = np.abs(
        (ang0[:, None] - cleft_degs[None, :] + 180.0) % 360.0 - 180.0
    ).min(axis=1)
    ang_diff_vein = np.abs(
        (ang0[:, None] - vein_degs[None, :] + 180.0) % 360.0 - 180.0
    ).min(axis=1)

    is_front_flower = is_petal & (nearest_flower == 0) & (rad0 > 0.22)
    # 5 道瓣间缝合暗槽：将五片花瓣从花喉向外缘清晰切分开
    petal_suture_moat = np.where(
        is_front_flower,
        np.clip((ang_diff_cleft - 3.5) / 14.0, 0.28, 1.0),
        1.0,
    ).astype(np.float32)
    # 5 道花瓣放射中脉：引导生物电动作电位沿五瓣中脊发光传导
    petal_vein_boost = np.where(
        is_front_flower,
        np.exp(-((ang_diff_vein / 11.0) ** 2)) * np.clip((rad0 - 0.20) / 0.95, 0.0, 1.0),
        0.0,
    ).astype(np.float32)

    # 识别花喉上瓣深紫红豹纹蜜导斑点与弯曲突出的长雄蕊丝
    crimson_spot = np.clip((r_ch - g_ch * 1.32) * 3.4, 0.0, 1.0)
    is_stamen_filament = is_petal & (ridge_factor > 0.34) & (throat_rad < 0.92)
    is_nectar_blotch = is_petal & (throat_rad < 0.78) & (crimson_spot > 0.45)

    # 2. B通道：生物电突触核心与五瓣维管束中脉权重 [0, 1]
    bio_node_weight = np.where(
        is_stamen_filament | is_nectar_blotch,
        np.clip(0.78 + 0.22 * np.maximum(crimson_spot, ridge_factor), 0.0, 1.0),
        np.where(
            is_petal,
            np.clip(0.22 + 0.58 * petal_vein_boost + 0.20 * np.maximum(ridge_factor, 0.0), 0.0, 0.85),
            np.where(is_leaf, 0.20 + 0.25 * np.maximum(ridge_factor, 0.0), 0.14),
        ),
    ).astype(np.float32)

    # 3. A通道：高对比度三维解剖结构光度 [0.06, 0.99]
    key_light_dir = np.array([-0.42, 0.56, 0.71], dtype=np.float32)
    key_light_dir /= np.linalg.norm(key_light_dir)
    ndotl = np.clip(np.sum(gltf_norm * key_light_dir[None, :], axis=1) * 0.55 + 0.45, 0.0, 1.0)

    # 视线掠角暗边：让卷曲的花瓣外缘与重叠交界自然变暗，勾勒锐利花瓣边界
    view_nz = np.abs(gltf_norm[:, 2])
    grazing_edge = np.clip((view_nz - 0.10) / 0.50, 0.22, 1.0)
    # 适配摄影测量贴图的真实亮度区间 [0.22, 0.46]，完整释放花瓣明暗褶皱与蜜导斑点对比度
    petal_luma_contrast = np.clip((tex_luma - 0.22) / 0.24, 0.12, 1.0)

    petal_shade = (
        (0.34 * ndotl + 0.42 * petal_luma_contrast + 0.24 * grazing_edge)
        * throat_cavity
        * inter_flower_moat
        * petal_suture_moat
        * flower_layer_weight
        * np.clip(1.0 + ridge_factor * 0.48 + petal_vein_boost * 0.28, 0.35, 1.42)
    )
    # 让深暗花心漏斗中伸出的弯曲雄蕊丝与蜜导斑点呈现鲜明的高对比度亮点
    petal_shade = np.where(
        is_stamen_filament,
        np.maximum(petal_shade, 0.94),
        np.where(is_nectar_blotch, np.maximum(petal_shade, 0.72), petal_shade),
    )

    leaf_luma_contrast = np.clip((tex_luma - 0.12) / 0.22, 0.15, 1.0)
    leaf_shade = np.clip(
        (0.20 + 0.42 * ndotl + 0.38 * leaf_luma_contrast)
        * np.clip(1.0 + ridge_factor * 0.38, 0.42, 1.32),
        0.14,
        0.78,
    )
    stem_shade = np.clip(0.18 + 0.48 * ndotl + 0.34 * leaf_luma_contrast, 0.12, 0.68)

    sculpted_shade = np.where(
        is_petal,
        np.clip(petal_shade, 0.06, 0.99),
        np.where(is_leaf, leaf_shade, stem_shade),
    ).astype(np.float32)

    meta_attr = mesh.attributes.new(
        name="_AZALEA_META", type="BYTE_COLOR", domain="POINT"
    )
    rgba_flat = np.stack(
        [geodesic_dist, organ_semantic, bio_node_weight, sculpted_shade], axis=1
    ).reshape(-1)
    meta_attr.data.foreach_set("color", rgba_flat)

    # 同步写入 _SAKURA_META 属性供「ASCII 枯荣 (Cybernetic Vanitas)」轮回模式使用
    rng = np.random.default_rng(108)
    num_clusters = 64
    seed_indices = rng.choice(num_verts, size=min(num_clusters, num_verts), replace=False)
    cluster_centers = gltf_pos[seed_indices]
    diff_c = gltf_pos[:, None, :] - cluster_centers[None, :, :]
    nearest_cluster = np.argmin(np.sum(diff_c * diff_c, axis=2), axis=1)
    cluster_id_norm = (nearest_cluster.astype(np.float32) + 0.5) / float(num_clusters)

    sakura_meta_attr = mesh.attributes.new(
        name="_SAKURA_META", type="BYTE_COLOR", domain="POINT"
    )
    sakura_rgba_flat = np.stack(
        [geodesic_dist, organ_semantic, cluster_id_norm, sculpted_shade], axis=1
    ).reshape(-1)
    sakura_meta_attr.data.foreach_set("color", sakura_rgba_flat)

    mat = bpy.data.materials.new(name="AzaleaBioMaterial")
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out_node = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf_node = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf_node.inputs["Roughness"].default_value = 0.72
    bsdf_node.inputs["Metallic"].default_value = 0.08

    tex_node = nodes.new(type="ShaderNodeTexImage")
    tex_node.image = azalea_img

    links.new(tex_node.outputs["Color"], bsdf_node.inputs["Base Color"])
    links.new(bsdf_node.outputs["BSDF"], out_node.inputs["Surface"])

    mesh.materials.clear()
    mesh.materials.append(mat)

    for img in list(bpy.data.images):
        if img != azalea_img:
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
        export_jpeg_quality=85,
    )

    out_size_mb = os.path.getsize(OUTPUT_GLB) / (1024 * 1024)
    print(
        f"[AzaleaBioPipeline] Exported: {OUTPUT_GLB} ({out_size_mb:.2f} MB), verts={num_verts}"
    )
    print(
        f"[AzaleaBioPipeline] Organs -> petal={int(is_petal.sum())}, leaf={int(is_leaf.sum())}, stem={num_verts - int(is_petal.sum()) - int(is_leaf.sum())}"
    )
    print(
        f"[AzaleaBioPipeline] Geodesic range: min={geodesic_dist.min():.3f}, p50={np.median(geodesic_dist):.3f}, max={geodesic_dist.max():.3f}"
    )


if __name__ == "__main__":
    main()
