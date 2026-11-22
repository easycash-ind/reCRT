"""
Batch 2: Blender 5.1 离线提取与性能优化脚本
处理：
1. 3 艘船：neolands_yacht.glb, yacht.glb, motor_yacht.glb
2. 3 辆车：2e6a5b3ae97243e581a9e1deec6d8bea.glb, zis-101a_sport_1938.glb, 2022_morgan_plus_six.glb
3. 城市建筑：realistic_city.glb & san_francisco_city.glb
"""

import os
import math
import bpy
from mathutils import Vector, Matrix

OUT_DIR = "/Users/yqg/Documents/Github/reCRT/public/citypop-glb"
os.makedirs(OUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def downscale_images(max_size=512):
    for img in list(bpy.data.images):
        try:
            w, h = img.size[0], img.size[1]
            if w > max_size or h > max_size:
                scale = max_size / max(w, h)
                nw = max(64, int(w * scale))
                nh = max(64, int(h * scale))
                img.scale(nw, nh)
        except Exception:
            pass


def get_world_bounds(objs):
    bmin = Vector((1e9, 1e9, 1e9))
    bmax = Vector((-1e9, -1e9, -1e9))
    found = False
    for o in objs:
        if o.type != "MESH" or not o.data or len(o.data.vertices) == 0:
            continue
        found = True
        for corner in o.bound_box:
            wc = o.matrix_world @ Vector(corner)
            bmin.x = min(bmin.x, wc.x)
            bmin.y = min(bmin.y, wc.y)
            bmin.z = min(bmin.z, wc.z)
            bmax.x = max(bmax.x, wc.x)
            bmax.y = max(bmax.y, wc.y)
            bmax.z = max(bmax.z, wc.z)
    if not found:
        return Vector((0, 0, 0)), Vector((1, 1, 1))
    return bmin, bmax


def join_and_normalize(
    objs,
    target_height=None,
    target_max_horiz=None,
    decimate_ratio=None,
    align_long_axis_to_y=False,
    z_sink_ratio=0.0,
    name="Asset",
):
    mesh_objs = [o for o in objs if o.type == "MESH" and o.data and len(o.data.vertices) > 0]
    if not mesh_objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in mesh_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = mesh_objs[0]
    if len(mesh_objs) > 1:
        bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name

    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    if decimate_ratio is not None and decimate_ratio < 0.99:
        mod = joined.modifiers.new(name="Decimate", type="DECIMATE")
        mod.ratio = decimate_ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)

    bmin, bmax = get_world_bounds([joined])
    size = bmax - bmin

    # 如果模型横向长轴在 X 方向，自动旋转 90 度使其长轴对齐 Y 轴（导出 glTF 后对应 Z 轴前后方向）
    if align_long_axis_to_y and size.x > size.y * 1.15:
        joined.rotation_euler = (0.0, 0.0, math.pi * 0.5)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        bmin, bmax = get_world_bounds([joined])
        size = bmax - bmin

    cx = (bmin.x + bmax.x) * 0.5
    cy = (bmin.y + bmax.y) * 0.5
    cz = bmin.z + size.z * z_sink_ratio

    scale_f = 1.0
    if target_height is not None and size.z > 1e-4:
        scale_f = target_height / size.z
    elif target_max_horiz is not None and max(size.x, size.y) > 1e-4:
        scale_f = target_max_horiz / max(size.x, size.y)

    joined.location = (-cx * scale_f, -cy * scale_f, -cz * scale_f)
    joined.scale = (scale_f, scale_f, scale_f)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return joined


def export_only(objs, filename):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        if o:
            o.select_set(True)
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_image_format="JPEG",
        export_jpeg_quality=82,
    )
    print(f"Exported {filename} ({os.path.getsize(path) // 1024} KB)")


def process_yachts():
    specs = [
        ("/Users/yqg/Downloads/neolands_yacht.glb", "user_yacht_neoland.glb", 11.5, 0.38, 0.14),
        ("/Users/yqg/Downloads/yacht.glb", "user_yacht_classic.glb", 10.8, 0.65, 0.16),
        ("/Users/yqg/Downloads/motor_yacht.glb", "user_yacht_motor.glb", 12.2, 0.04, 0.15),
    ]
    for src, out_name, length_m, dec_ratio, sink in specs:
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=src)
        downscale_images(512)
        meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
        j = join_and_normalize(
            meshes,
            target_max_horiz=length_m,
            decimate_ratio=dec_ratio,
            align_long_axis_to_y=True,
            z_sink_ratio=sink,
            name=out_name.replace(".glb", ""),
        )
        if j:
            export_only([j], out_name)


def process_cars():
    import bmesh

    # 1. 2e6a5b3ae97243e581a9e1deec6d8bea.glb
    # 剔除模型自带的场景路灯杆/电线杆 (lantern_wall_*) 与大面积地面阴影板 (shadow)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath="/Users/yqg/Downloads/2e6a5b3ae97243e581a9e1deec6d8bea.glb")
    downscale_images(512)
    clean_retro_meshes = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.data:
            continue
        mat_names = " ".join([m.name.lower() for m in o.data.materials if m])
        if any(bad in mat_names for bad in ["lantern", "shadow", "wall", "floor", "ground"]):
            continue
        clean_retro_meshes.append(o)

    c1 = join_and_normalize(
        clean_retro_meshes,
        target_max_horiz=4.4,
        decimate_ratio=0.55,
        align_long_axis_to_y=True,
        name="UserCarRetroA",
    )
    if c1:
        export_only([c1], "user_car_retro_a.glb")

    # 2. zis-101a_sport_1938.glb
    # 剔除地板 (floor01) 与高面数车内仪表盘杂件，先焊接顶点再适度减面，并将纯黑车漆提亮为浅银白底色，彻底解决破面与死黑问题
    clear_scene()
    bpy.ops.import_scene.gltf(filepath="/Users/yqg/Downloads/zis-101a_sport_1938.glb")
    downscale_images(512)
    zis_meshes = []
    skip_keywords = ["floor", "instruments", "stwheel", "buttons", "stwglass", "instrglass", "indoor"]
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or not o.data:
            continue
        if any(k in o.name.lower() for k in skip_keywords):
            continue
        for m in o.data.materials:
            if m and "body" in m.name.lower() and m.use_nodes:
                for node in m.node_tree.nodes:
                    if node.type == "BSDF_PRINCIPLED":
                        node.inputs["Base Color"].default_value = (0.85, 0.89, 0.94, 1.0)
        zis_meshes.append(o)

    c2 = join_and_normalize(
        zis_meshes,
        target_max_horiz=4.75,
        decimate_ratio=None,
        align_long_axis_to_y=True,
        name="UserCarZis101",
    )
    if c2:
        # 先焊接重合顶点以保护曲面连续性，再执行温和减面
        bm = bmesh.new()
        bm.from_mesh(c2.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0015)
        bm.to_mesh(c2.data)
        bm.free()

        mod = c2.modifiers.new(name="Decimate", type="DECIMATE")
        mod.ratio = 0.18
        bpy.context.view_layer.objects.active = c2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        export_only([c2], "user_car_zis101.glb")

    # 3. 2022_morgan_plus_six.glb (过滤掉所有 DAMAGE / BROKEN / scratches 战损网格)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath="/Users/yqg/Downloads/2022_morgan_plus_six.glb")
    downscale_images(512)
    clean_meshes = []
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        chain = o.name
        p = o.parent
        while p:
            chain += " " + p.name
            p = p.parent
        if any(bad in chain.upper() for bad in ["DAMAGE", "BROKEN", "SCRATCH"]):
            continue
        clean_meshes.append(o)

    c3 = join_and_normalize(
        clean_meshes,
        target_max_horiz=4.35,
        decimate_ratio=0.35,
        align_long_axis_to_y=True,
        name="UserCarMorgan",
    )
    if c3:
        export_only([c3], "user_car_morgan.glb")


def process_buildings():
    # 从 realistic_city.glb 中提取 3 座代表性现代建筑群（不做破坏性三角面塌陷减面，彻底杜绝玻璃窗只剩单块三角面的破面问题）
    clear_scene()
    bpy.ops.import_scene.gltf(filepath="/Users/yqg/Downloads/realistic_city.glb")
    downscale_images(512)

    target_groups = [
        ("Residential Building_6", "user_city_bldg_1.glb", 26.0),
        ("Building_10", "user_city_bldg_2.glb", 34.0),
        ("Residential Complex Building_31", "user_city_bldg_3.glb", 30.0),
    ]

    all_objs = list(bpy.context.scene.objects)
    for grp_name, out_name, h_m in target_groups:
        grp_meshes = []
        for o in all_objs:
            if o.type != "MESH":
                continue
            p = o
            while p:
                if p.name == grp_name:
                    grp_meshes.append(o)
                    break
                p = p.parent
        if grp_meshes:
            copied = []
            for m in grp_meshes:
                c = m.copy()
                c.data = m.data.copy()
                bpy.context.collection.objects.link(c)
                copied.append(c)
            b = join_and_normalize(copied, target_height=h_m, decimate_ratio=None, name=out_name.replace(".glb", ""))
            if b:
                export_only([b], out_name)


if __name__ == "__main__":
    process_cars()
