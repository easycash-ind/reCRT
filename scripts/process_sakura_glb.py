"""
Blender 5.1 离线几何与解剖学刚体分件烘焙管线：河津樱 (Kawazu Sakura)
运行方式：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/process_sakura_glb.py

核心解决痛点：
1. 彻底根除“果冻蠕动感”：
   将整株樱花按真实三维空间拓扑划分为独立的“解剖刚体分件 (Articulated Rigid Parts)”：
   - Part 0: 主木质枝干 (Main Branch)
   - Part 1: 顶部高扬花朵 (Top Blossom)
   - Part 2: 中左正面盛放主花 (Center-Left Main Blossom)
   - Part 3: 中右上层盛放花朵 (Center-Right Upper Blossom)
   - Part 4: 右上侧翼花朵 (Far-Right Lateral Blossom)
   - Part 5: 中右下层盛放花朵 (Center-Right Lower Blossom)
   - Part 6: 底部垂枝花朵 (Bottom Hanging Blossom)
   - Part 7: 右侧嫩绿长叶簇 (Right Emergent Leaves)
   每一朵花的所有顶点 100% 绑定到同一个 Part ID，在 Vertex Shader 中围绕该朵花真实的“花梗支点 (Pedicel Hinge Pivot)”做纯粹的刚体铰链摆动与点头，花朵内部零拉伸、零蠕动！

2. 强化立体光影雕塑层次 (Dramatic Chiaroscuro & Cavity AO)：
   在 Blender 中计算每个顶点在局部花朵球面上的“迎光隆起度 / 花心凹陷环境遮蔽 (Cavity AO) / 前后景纵深层次”，
   烘焙至 _SAKURA_META.w，使花朵呈现出从左上受光高光核、柔粉中调、到背光深绛红阴影的强烈立体光影反差。
"""

import math
import os
import bpy
import bmesh
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
INPUT_GLB = os.path.join(
    PROJECT_ROOT, "public", "scan-glb", "cc0__kawazu_sakura_prunus_lannesiana.glb"
)
OUTPUT_GLB = os.path.join(
    PROJECT_ROOT, "public", "scan-glb", "kawazu_sakura_ascii_ready.glb"
)


def create_sakura_petal_chip(mat, petal_uv_center=(0.5, 0.5), petal_uv_radius=0.025):
    bm = bmesh.new()
    cols = 5
    rows = 7
    verts_grid = []
    for r in range(rows):
        v_norm = r / (rows - 1)
        width_profile = math.sin(v_norm * math.pi * 0.88) * (
            1.0 - 0.15 * v_norm * v_norm
        )
        row_verts = []
        for c in range(cols):
            u_norm = (c / (cols - 1)) * 2.0 - 1.0
            x = u_norm * 0.18 * width_profile
            notch = (
                0.045
                * max(0.0, (v_norm - 0.72) / 0.28)
                * max(0.0, 1.0 - abs(u_norm) * 2.2)
            )
            y = (v_norm - 0.45) * 0.46 - notch
            z = u_norm * u_norm * 0.045 + math.sin(v_norm * math.pi) * 0.038
            v = bm.verts.new((x, y, z))
            row_verts.append(v)
        verts_grid.append(row_verts)

    bm.verts.ensure_lookup_table()
    uv_layer = bm.loops.layers.uv.new("UVMap")

    u_cx, u_cy = petal_uv_center
    for r in range(rows - 1):
        for c in range(cols - 1):
            v00 = verts_grid[r][c]
            v10 = verts_grid[r][c + 1]
            v11 = verts_grid[r + 1][c + 1]
            v01 = verts_grid[r + 1][c]
            face = bm.faces.new((v00, v10, v11, v01))
            face.smooth = True
            for loop in face.loops:
                vx, vy, _ = loop.vert.co
                lu = u_cx + (vx / 0.20) * petal_uv_radius
                lv = u_cy + (vy / 0.25) * petal_uv_radius
                loop[uv_layer].uv = (
                    min(max(lu, 0.01), 0.99),
                    min(max(lv, 0.01), 0.99),
                )

    chip_mesh = bpy.data.meshes.new("SakuraPetalChipMesh")
    bm.to_mesh(chip_mesh)
    bm.free()

    chip_mesh.materials.append(mat)
    meta_attr = chip_mesh.attributes.new(
        name="_SAKURA_META", type="BYTE_COLOR", domain="POINT"
    )
    meta_data = np.tile(
        np.array([1.0, 1.0, 0.5, 0.85], dtype=np.float32), (len(chip_mesh.vertices), 1)
    ).reshape(-1)
    meta_attr.data.foreach_set("color", meta_data)

    chip_mesh.validate()
    chip_mesh.update()

    chip_obj = bpy.data.objects.new("SakuraPetalChip", chip_mesh)
    bpy.context.collection.objects.link(chip_obj)
    return chip_obj


def main():
    print(f"[SakuraPipeline] Loading source GLB: {INPUT_GLB}")
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
    main_obj.name = "SakuraBranchMain"
    main_obj.data.name = "SakuraBranchMainMesh"

    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    for obj in list(bpy.data.objects):
        if obj != main_obj:
            bpy.data.objects.remove(obj, do_unlink=True)

    mesh = main_obj.data
    for attr in list(mesh.attributes):
        if attr.data_type in ("FLOAT_COLOR", "BYTE_COLOR") or attr.name.startswith(
            "COLOR"
        ):
            mesh.attributes.remove(attr)

    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.000015)
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

    sakura_img = None
    for img in bpy.data.images:
        if img.size[0] >= 512 and img.name != "Image_0":
            sakura_img = img
            break
    if sakura_img is None:
        sakura_img = bpy.data.images[0]

    w, h = sakura_img.size
    pixels = np.array(sakura_img.pixels[:], dtype=np.float32).reshape((h, w, 4))

    num_verts = len(mesh.vertices)
    vert_rgb_sum = np.zeros((num_verts, 3), dtype=np.float32)
    vert_rgb_cnt = np.zeros(num_verts, dtype=np.float32)
    best_petal_uv = (0.5, 0.5)
    best_pink_score = -1.0

    uv_layer = mesh.uv_layers.active.data
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            uv = uv_layer[li].uv
            u_wrap = float(uv.x % 1.0)
            v_wrap = float(uv.y % 1.0)
            px = min(max(int(u_wrap * w), 0), w - 1)
            py = min(max(int(v_wrap * h), 0), h - 1)
            rgb = pixels[py, px, :3]
            vert_rgb_sum[vi] += rgb
            vert_rgb_cnt[vi] += 1.0
            pink_score = float(
                rgb[0] * 1.2 + rgb[2] * 0.9 - abs(rgb[0] - rgb[1]) * 0.5
            )
            if (
                rgb[0] > 0.82
                and rgb[1] > 0.65
                and rgb[2] > 0.68
                and pink_score > best_pink_score
            ):
                best_pink_score = pink_score
                best_petal_uv = (u_wrap, v_wrap)

    vert_rgb = vert_rgb_sum / np.maximum(vert_rgb_cnt[:, None], 1.0)
    # 注意：Blender 内部坐标 (bx, by, bz) 导出为 glTF (+Y up, +Z forward) 时的对应关系为：
    # gltf_X = bx, gltf_Y = bz, gltf_Z = -by
    verts_blender = np.array([v.co[:] for v in mesh.vertices], dtype=np.float32)
    norms_blender = np.array([v.normal[:] for v in mesh.vertices], dtype=np.float32)

    gltf_pos = np.stack(
        [verts_blender[:, 0], verts_blender[:, 2], -verts_blender[:, 1]], axis=1
    )
    gltf_norm = np.stack(
        [norms_blender[:, 0], norms_blender[:, 2], -norms_blender[:, 1]], axis=1
    )

    x_min = float(gltf_pos[:, 0].min())
    r_ch, g_ch, b_ch = vert_rgb[:, 0], vert_rgb[:, 1], vert_rgb[:, 2]

    is_petal = (
        (r_ch > 0.54)
        & (b_ch > 0.38)
        & (r_ch >= g_ch * 0.95)
        & (gltf_pos[:, 0] > x_min + 0.55)
    )
    is_leaf = (
        (~is_petal)
        & (g_ch > r_ch * 1.01)
        & (g_ch > b_ch * 1.14)
        & (g_ch > 0.20)
    )

    organ_semantic = np.zeros(num_verts, dtype=np.float32)
    organ_semantic[is_leaf] = 0.5
    organ_semantic[is_petal] = 1.0

    # 定义 6 朵主要樱花在 glTF 空间中的花冠中心坐标，将花瓣顶点按最近邻分配给这 6 个刚体花朵分件 (Part 1..6)
    # 这样每朵花内部的所有顶点拥有 100% 相同的刚体 Part ID，绕该朵花的花梗支点做整体铰链摆动，彻底消除花瓣内部变形蠕动！
    blossom_centers = np.array(
        [
            [0.22, 1.38, 0.35],   # Part 1: 顶部高扬花朵
            [-0.28, 0.15, 0.85],  # Part 2: 中左正面盛放主花
            [0.78, 0.45, 0.65],   # Part 3: 中右上层花朵
            [1.28, 0.68, 0.15],   # Part 4: 右上侧翼花朵
            [0.88, -0.32, 0.72],  # Part 5: 中右下层花朵
            [0.28, -1.25, 0.55],  # Part 6: 底部垂枝花朵
        ],
        dtype=np.float32,
    )

    diffs = gltf_pos[:, None, :] - blossom_centers[None, :, :]
    dists = np.linalg.norm(diffs, axis=2)
    nearest_blossom = np.argmin(dists, axis=1)  # 0..5

    # Part ID 编码进 _SAKURA_META.z (0..1):
    # 0.0 = 主木质枝干 (Part 0)
    # 1/8 .. 6/8 = 6 朵独立刚体樱花 (Part 1..6)
    # 7/8 = 右侧上层绿叶 (Part 7)
    # 8/8 = 右侧下层绿叶 (Part 8)
    part_id_norm = np.zeros(num_verts, dtype=np.float32)
    for b_idx in range(6):
        mask = is_petal & (nearest_blossom == b_idx)
        part_id_norm[mask] = (b_idx + 1) / 8.0

    upper_leaf_mask = is_leaf & (gltf_pos[:, 1] >= -0.35)
    lower_leaf_mask = is_leaf & (gltf_pos[:, 1] < -0.35)
    part_id_norm[upper_leaf_mask] = 7.0 / 8.0
    part_id_norm[lower_leaf_mask] = 8.0 / 8.0

    # 计算每朵花内部的“3D 球面立体雕塑光度与花心深陷遮蔽 (Sculpted Chiaroscuro Shade)” -> 存入 _SAKURA_META.w
    # 结合：
    # 1. 左上角主平行光方向 (-0.55, 0.68, 0.48) 与每个花朵相对于自身花心的径向法线
    # 2. 花心凹陷处的 Cavity AO（离花心越近越深邃，花瓣中部隆起最亮，背光下缘深暗）
    # 3. 前后景纵深 Z-Depth（前排花朵如 Part 2,3,5 明亮突出，后侧花朵如 Part 4 与背光花萼深沉内敛）
    key_light_dir = np.array([-0.52, 0.66, 0.54], dtype=np.float32)
    key_light_dir /= np.linalg.norm(key_light_dir)

    sculpted_shade = np.full(num_verts, 0.5, dtype=np.float32)
    tex_luma = 0.299 * r_ch + 0.587 * g_ch + 0.114 * b_ch

    for i in range(num_verts):
        if is_petal[i]:
            b_idx = nearest_blossom[i]
            c_pos = blossom_centers[b_idx]
            rel_vec = gltf_pos[i] - c_pos
            radial_dist = float(np.linalg.norm(rel_vec))
            radial_dir = rel_vec / max(radial_dist, 1e-4)

            # 混合表面真实法线与花朵球面径向向量，获得干净无噪点的花瓣立体朝向
            blended_n = gltf_norm[i] * 0.45 + radial_dir * 0.55
            norm_len = float(np.linalg.norm(blended_n))
            if norm_len > 1e-4:
                blended_n /= norm_len

            # 左上角斜射主光点积 [-1, 1] -> [0, 1]
            ndotl = float(np.dot(blended_n, key_light_dir))
            dir_light = np.clip(ndotl * 0.55 + 0.45, 0.0, 1.0)

            # 花心深陷 Cavity AO：距离花心 < 0.22 的凹陷区压暗，距离 0.35~0.65 的花瓣受光隆起面提亮
            cavity_ao = np.clip((radial_dist - 0.08) / 0.38, 0.25, 1.0)

            # 前后景深度层次：Z 越靠前越亮，Z 靠后的背光花层自然退后
            depth_layer = np.clip((gltf_pos[i, 2] + 0.8) / 2.2, 0.35, 1.0)

            # 融合原贴图烘焙的真实褶皱明暗
            shade = (
                dir_light * 0.48
                + float(tex_luma[i]) * 0.28
                + depth_layer * 0.24
            ) * (0.42 + 0.58 * cavity_ao)
            sculpted_shade[i] = np.clip(shade, 0.05, 0.99)
        elif is_leaf[i]:
            ndotl = abs(float(np.dot(gltf_norm[i], key_light_dir)))
            sculpted_shade[i] = np.clip(
                0.25 + ndotl * 0.45 + float(g_ch[i]) * 0.35, 0.1, 0.95
            )
        else:
            # 枝干：左上方迎光面亮琥珀色，下侧背光面深褐色
            ndotl = max(float(np.dot(gltf_norm[i], key_light_dir)), 0.0)
            sculpted_shade[i] = np.clip(
                0.15 + ndotl * 0.55 + float(tex_luma[i]) * 0.35, 0.08, 0.90
            )

    # 悬臂梁距左端根部的水平跨度比例 -> _SAKURA_META.x
    span_ratio = np.clip((gltf_pos[:, 0] - x_min) / 4.90, 0.0, 1.0)

    meta_attr = mesh.attributes.new(
        name="_SAKURA_META", type="BYTE_COLOR", domain="POINT"
    )
    rgba_flat = np.stack(
        [span_ratio, organ_semantic, part_id_norm, sculpted_shade], axis=1
    ).reshape(-1)
    meta_attr.data.foreach_set("color", rgba_flat)

    mat = bpy.data.materials.new(name="SakuraBotanicalMaterial")
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out_node = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf_node = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf_node.inputs["Roughness"].default_value = 0.78
    bsdf_node.inputs["Metallic"].default_value = 0.05

    tex_node = nodes.new(type="ShaderNodeTexImage")
    tex_node.image = sakura_img

    links.new(tex_node.outputs["Color"], bsdf_node.inputs["Base Color"])
    links.new(bsdf_node.outputs["BSDF"], out_node.inputs["Surface"])

    mesh.materials.clear()
    mesh.materials.append(mat)

    create_sakura_petal_chip(mat, petal_uv_center=best_petal_uv, petal_uv_radius=0.025)

    for img in list(bpy.data.images):
        if img != sakura_img:
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
        f"[SakuraPipeline] Exported articulated & sculpted GLB: {OUTPUT_GLB} ({out_size_mb:.2f} MB)"
    )


if __name__ == "__main__":
    main()
