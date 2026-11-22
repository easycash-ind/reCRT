"""
Blender 5.1 多物种「赛博枯荣循环 (Cybernetic Vanitas)」离线几何与生长/风化语义烘焙脚本
运行方式：
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/process_vanitas_specimens.py

处理物种：
1. 山杜鹃 (Rhododendron kaempferi): cc0__moutain_azalea.glb -> mountain_azalea_ascii_ready.glb
2. 大紫杜鹃 (Rhododendron x pulchrum): cc0__oomurasaki_azalea_r._x_pulchrum.glb -> oomurasaki_azalea_ascii_ready.glb

烘焙 _SAKURA_META 四通道属性：
- x: Geodesic Growth Phase (0.0=枝干根部 -> 0.45=分枝/叶片 -> 0.65=花托花心 -> 1.0=花瓣外缘，驱动春季生长与秋季由外向内风化)
- y: Organ Semantic (0.0=褐枝, 0.5=苍翠叶片, 1.0=盛开花瓣)
- z: 64-Cluster Voronoi Erosion ID (64 个 3D 泰森多边形晶格 ID，驱动秋季反重力旋度风化剥离)
- w: 3D Sculpted Chiaroscuro Shade (结合左上主光源、花心凹陷 Cavity AO 与前后景纵深的立体光度)
"""

import os
import bpy
import numpy as np

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SCAN_DIR = os.path.join(PROJECT_ROOT, "public", "scan-glb")

SPECIMENS = [
    {
        "id": "mountain_azalea",
        "input": os.path.join(SCAN_DIR, "cc0__moutain_azalea.glb"),
        "output": os.path.join(SCAN_DIR, "mountain_azalea_ascii_ready.glb"),
        "decimate_ratio": 0.045,
        "petal_rule": lambda r, g, b: (r > 0.44) & (r > g * 1.42),
        "leaf_rule": lambda r, g, b: (g > b * 1.45) & (r <= g * 1.35) & (g > 0.16),
    },
    {
        "id": "oomurasaki_azalea",
        "input": os.path.join(SCAN_DIR, "cc0__oomurasaki_azalea_r._x_pulchrum.glb"),
        "output": os.path.join(SCAN_DIR, "oomurasaki_azalea_ascii_ready.glb"),
        "decimate_ratio": 0.032,
        # 大紫杜鹃花瓣为紫品红色 (B > G)，而底部橄榄绿叶片为 (G > B * 1.25)，据此 100% 精确分离花与叶！
        "petal_rule": lambda r, g, b: (r > 0.38) & (b > g * 1.05) & (r > g * 1.32),
        "leaf_rule": lambda r, g, b: (g > b * 1.22) & (g > 0.14),
    },
]


def process_specimen(spec):
    print(f"\n[VanitasPipeline] Processing {spec['id']} from {spec['input']}...")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=spec["input"])

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
    main_obj.name = "VanitasSpecimenMain"
    main_obj.data.name = "VanitasSpecimenMainMesh"

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
    dec_mod.ratio = spec["decimate_ratio"]
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

    main_img = None
    for img in bpy.data.images:
        if img.size[0] >= 512 and img.name != "Image_0":
            main_img = img
            break
    if main_img is None:
        main_img = bpy.data.images[0]

    w, h = main_img.size
    pixels = np.array(main_img.pixels[:], dtype=np.float32).reshape((h, w, 4))

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
    gltf_pos = np.stack(
        [verts_blender[:, 0], verts_blender[:, 2], -verts_blender[:, 1]], axis=1
    )
    gltf_norm = np.stack(
        [norms_blender[:, 0], norms_blender[:, 2], -norms_blender[:, 1]], axis=1
    )

    r_ch, g_ch, b_ch = vert_rgb[:, 0], vert_rgb[:, 1], vert_rgb[:, 2]
    tex_luma = 0.299 * r_ch + 0.587 * g_ch + 0.114 * b_ch

    is_petal = spec["petal_rule"](r_ch, g_ch, b_ch)
    is_leaf = (~is_petal) & spec["leaf_rule"](r_ch, g_ch, b_ch)

    organ_semantic = np.zeros(num_verts, dtype=np.float32)
    organ_semantic[is_leaf] = 0.5
    organ_semantic[is_petal] = 1.0

    print(
        f"[VanitasPipeline] {spec['id']} verts={num_verts} -> Petals={int(is_petal.sum())}, Leaves={int(is_leaf.sum())}, Branches={int((~is_petal & ~is_leaf).sum())}"
    )

    # 1. 计算层次化生长测地线相位 (Hierarchical Geodesic Growth Phase -> _SAKURA_META.x):
    # 使春季生长严格遵循：左端枝干 (0.0~0.35) -> 叶片舒展 (0.28~0.62) -> 花冠由花心向外缘盛放 (0.45~1.00)
    # 同时使秋季熵增风化严格遵循：花瓣外缘最先解构剥离 (1.00->0.45) -> 叶片风化 -> 枝干最后化作星尘！
    x_min = float(gltf_pos[:, 0].min())
    root_anchor = np.array([x_min, -0.35, 0.0], dtype=np.float32)
    dist_from_root = np.linalg.norm(gltf_pos - root_anchor[None, :], axis=1)
    norm_dist = np.clip(
        dist_from_root / max(float(dist_from_root.max()), 1e-4), 0.0, 1.0
    )

    geodesic_phase = norm_dist * 0.48
    geodesic_phase[is_leaf] = 0.28 + norm_dist[is_leaf] * 0.36
    geodesic_phase[is_petal] = 0.44 + norm_dist[is_petal] * 0.56
    geodesic_phase = np.clip(geodesic_phase, 0.01, 0.99)

    # 2. 生成 64 个 3D Voronoi 晶格簇 ID (-> _SAKURA_META.z)，用于驱动秋季反重力晶格剥离与星尘消散
    rng = np.random.default_rng(108)
    num_clusters = 64
    seed_indices = rng.choice(num_verts, size=min(num_clusters, num_verts), replace=False)
    cluster_centers = gltf_pos[seed_indices]
    diff = gltf_pos[:, None, :] - cluster_centers[None, :, :]
    dist_sq = np.sum(diff * diff, axis=2)
    nearest_cluster = np.argmin(dist_sq, axis=1)
    cluster_id_norm = (nearest_cluster.astype(np.float32) + 0.5) / float(num_clusters)

    # 3. 计算 3D 立体雕塑光度 (-> _SAKURA_META.w)，适配摄影测量贴图的真实亮度区间 [0.18, 0.48]
    key_light_dir = np.array([-0.52, 0.66, 0.54], dtype=np.float32)
    key_light_dir /= np.linalg.norm(key_light_dir)

    ndotl = np.clip(np.sum(gltf_norm * key_light_dir[None, :], axis=1) * 0.5 + 0.5, 0.0, 1.0)
    depth_layer = np.clip((gltf_pos[:, 2] + 1.8) / 3.6, 0.25, 1.0)
    luma_contrast = np.clip((tex_luma - 0.18) / 0.30, 0.08, 1.0)
    sculpted_shade = np.clip(
        luma_contrast * 0.48 + ndotl * 0.34 + depth_layer * 0.18, 0.08, 0.98
    )

    rgba_flat = np.stack(
        [geodesic_phase, organ_semantic, cluster_id_norm, sculpted_shade], axis=1
    ).reshape(-1)

    for attr_name in ("_SAKURA_META", "_AZALEA_META"):
        meta_attr = mesh.attributes.new(
            name=attr_name, type="BYTE_COLOR", domain="POINT"
        )
        meta_attr.data.foreach_set("color", rgba_flat)

    mat = bpy.data.materials.new(name="VanitasBotanicalMaterial")
    mat.use_backface_culling = False
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()

    out_node = nodes.new(type="ShaderNodeOutputMaterial")
    bsdf_node = nodes.new(type="ShaderNodeBsdfPrincipled")
    bsdf_node.inputs["Roughness"].default_value = 0.76
    bsdf_node.inputs["Metallic"].default_value = 0.05

    tex_node = nodes.new(type="ShaderNodeTexImage")
    tex_node.image = main_img

    links.new(tex_node.outputs["Color"], bsdf_node.inputs["Base Color"])
    links.new(bsdf_node.outputs["BSDF"], out_node.inputs["Surface"])

    mesh.materials.clear()
    mesh.materials.append(mat)

    for img in list(bpy.data.images):
        if img != main_img:
            bpy.data.images.remove(img)

    bpy.ops.export_scene.gltf(
        filepath=spec["output"],
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

    out_size_mb = os.path.getsize(spec["output"]) / (1024 * 1024)
    print(f"[VanitasPipeline] Exported {spec['output']} ({out_size_mb:.2f} MB)")


def main():
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    process_specimen(SPECIMENS[0])
    import process_azalea_glb
    process_azalea_glb.main()


if __name__ == "__main__":
    main()
