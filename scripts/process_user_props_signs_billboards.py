"""
Batch 1: Blender 5.1 离线提取与性能优化脚本
处理：
1. /Users/yqg/Downloads/city_props_collection_volume_1.glb -> 城市街景小零件
2. /Users/yqg/Downloads/5702c0179e3a45d7bd66d072f3b47dff.glb -> 公路路牌及 3 种延展结构变体
3. /Users/yqg/Downloads/tf2_city_central.glb -> 3 座大型钢结构广告牌
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


def join_and_normalize(objs, target_height=None, target_max_dim=None, decimate_ratio=None, name="Asset"):
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

    # Apply transforms
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    if decimate_ratio is not None and decimate_ratio < 0.99:
        mod = joined.modifiers.new(name="Decimate", type="DECIMATE")
        mod.ratio = decimate_ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)

    bmin, bmax = get_world_bounds([joined])
    size = bmax - bmin
    cx = (bmin.x + bmax.x) * 0.5
    cy = (bmin.y + bmax.y) * 0.5
    cz = bmin.z

    scale_f = 1.0
    if target_height is not None and size.z > 1e-4:
        scale_f = target_height / size.z
    elif target_max_dim is not None and max(size.x, size.y, size.z) > 1e-4:
        scale_f = target_max_dim / max(size.x, size.y, size.z)

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


def process_city_props():
    clear_scene()
    bpy.ops.import_scene.gltf(filepath="/Users/yqg/Downloads/city_props_collection_volume_1.glb")
    downscale_images(256)

    all_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    def find_by_keywords(kws):
        res = []
        for o in all_meshes:
            full = o.name
            p = o.parent
            while p:
                full += " " + p.name
                p = p.parent
            if any(k.lower() in full.lower() for k in kws):
                res.append(o)
        return res

    # 1. 公交候车亭 BusStop
    bus_objs = [o.copy() for o in find_by_keywords(["BusStop"])]
    for o in bus_objs:
        o.data = o.data.copy()
        bpy.context.collection.objects.link(o)
    bus_joined = join_and_normalize(bus_objs, target_height=3.1, decimate_ratio=0.45, name="UserBusStop")
    if bus_joined:
        export_only([bus_joined], "user_prop_bus_stop.glb")

    # 2. 街头 ATM + 邮筒 + 消防栓 + 停车表组合包
    street_cluster = []
    specs = [
        (["ATM"], 2.1, (0.0, 0.0, 0.0)),
        (["PostBox"], 1.35, (1.45, 0.1, 0.0)),
        (["FireHydrant"], 0.88, (-1.25, 0.15, 0.0)),
        (["ParkingMeter"], 1.25, (-2.1, 0.15, 0.0)),
    ]
    for kws, h, offset in specs:
        found = [o.copy() for o in find_by_keywords(kws)]
        for o in found:
            o.data = o.data.copy()
            bpy.context.collection.objects.link(o)
        j = join_and_normalize(found, target_height=h, decimate_ratio=0.4, name=kws[0])
        if j:
            j.location = offset
            street_cluster.append(j)
    if street_cluster:
        export_only(street_cluster, "user_prop_sidewalk_cluster.glb")

    # 3. 街边休闲长椅 + 垃圾桶 + 配电箱组合
    bench_cluster = []
    specs2 = [
        (["ParkBenchLong"], 0.92, (0.0, 0.0, 0.0)),
        (["TrashCommercial"], 1.15, (1.85, 0.0, 0.0)),
        (["Utility"], 1.65, (-1.95, -0.2, 0.0)),
    ]
    for kws, h, offset in specs2:
        found = [o.copy() for o in find_by_keywords(kws)]
        for o in found:
            o.data = o.data.copy()
            bpy.context.collection.objects.link(o)
        j = join_and_normalize(found, target_height=h, decimate_ratio=0.45, name=kws[0])
        if j:
            j.location = offset
            bench_cluster.append(j)
    if bench_cluster:
        export_only(bench_cluster, "user_prop_bench_utility.glb")


def process_road_sign_variants():
    import bmesh

    clear_scene()
    bpy.ops.import_scene.gltf(filepath="/Users/yqg/Downloads/5702c0179e3a45d7bd66d072f3b47dff.glb")

    # 仅保留主体立柱、横梁与路牌板面 (Object_4, Object_5)，剔除 29 万面的微型螺栓杂件 (Object_6..10)
    keep_objs = [
        o for o in bpy.context.scene.objects
        if o.type == "MESH" and o.name in ("Object_4", "Object_5")
    ]
    if not keep_objs:
        return

    bm = bmesh.new()
    for o in keep_objs:
        bm_part = bmesh.new()
        bm_part.from_mesh(o.data)
        bm_part.transform(o.matrix_world)
        bm_part.to_mesh(o.data)
        bm.from_mesh(o.data)
        bm_part.free()

    # 1. 绕 Y 轴与 Z 轴整理朝向：
    #    - 绕 Z 轴旋转 180° 使路牌正面朝向 +Y（导出 glTF Y-up 后对应 -Z，即正对迎面驶来的玩家车辆！）
    #    - 将原立柱中心平移至 x = 0.0，并沿 X 轴镜像使 3.8m 长悬臂朝向 +X（道路内侧上方）
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0.0, 0.0, 0.0), matrix=Matrix.Rotation(math.pi, 3, "Z"))
    bmesh.ops.translate(bm, verts=bm.verts, vec=(-0.82, 0.0, 0.0))
    bmesh.ops.scale(bm, verts=bm.verts, vec=(-1.0, 1.0, 1.0))

    # 焊接重合顶点，保护边线与法线连续性
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.002)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh_base = bpy.data.meshes.new("RoadSignCleanMesh")
    bm.to_mesh(mesh_base)
    bm.free()

    obj_base = bpy.data.objects.new("RoadSignBase", mesh_base)
    bpy.context.collection.objects.link(obj_base)
    bpy.context.view_layer.objects.active = obj_base

    # 温和减面至 ~3200 顶点（低于 8000 阈值，确保运行时 100% 启用钢笔外轮廓描边与结构折痕墨线）
    mod = obj_base.modifiers.new(name="Decimate", type="DECIMATE")
    mod.ratio = 0.065
    bpy.ops.object.modifier_apply(modifier=mod.name)

    # 2. 彻底清除模型自带的写实锈迹贴图，替换为两套纯净材质：
    #    - 材质 0: RoadSignSteel（银白/浅蓝灰钢结构立柱、横梁与背板，受四阶赛璐璐色温光影分层）
    #    - 材质 1: RoadSignFace（高速路牌正面面板，重映射平面 UV 供 City Pop 矢量交通路牌贴图渲染）
    mat_steel = bpy.data.materials.new(name="RoadSignSteel")
    mat_steel.use_nodes = True
    for n in mat_steel.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Base Color"].default_value = (0.78, 0.86, 0.96, 1.0)
            n.inputs["Roughness"].default_value = 0.4

    mat_face = bpy.data.materials.new(name="RoadSignFace")
    mat_face.use_nodes = True
    for n in mat_face.node_tree.nodes:
        if n.type == "BSDF_PRINCIPLED":
            n.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
            n.inputs["Roughness"].default_value = 0.5

    obj_base.data.materials.clear()
    obj_base.data.materials.append(mat_steel)
    obj_base.data.materials.append(mat_face)

    bm_mat = bmesh.new()
    bm_mat.from_mesh(obj_base.data)
    bm_mat.normal_update()
    uv_layer = bm_mat.loops.layers.uv.verify()

    # 识别上方两块主路牌正面 (z > 5.6) 与立柱中部路牌正面 (3.6 < z <= 5.6)，要求法线朝向 +Y 来车方向 (normal.y > 0.72)
    for f in bm_mat.faces:
        c = f.calc_center_median()
        if c.z > 5.6 and f.normal.y > 0.72:
            f.material_index = 1
            is_left_board = c.x < 0.0
            x0, x1 = (-2.66, -0.69) if is_left_board else (0.83, 3.80)
            z0, z1 = (5.95, 7.74)
            for loop in f.loops:
                co = loop.vert.co
                u = 1.0 - max(0.0, min(1.0, (co.x - x0) / max(0.01, x1 - x0)))
                v = max(0.0, min(1.0, (co.z - z0) / max(0.01, z1 - z0)))
                loop[uv_layer].uv = (u, v)
        elif 3.6 < c.z <= 5.6 and f.normal.y > 0.72:
            f.material_index = 1
            x0, x1 = (-0.48, 0.49)
            z0, z1 = (3.81, 5.48)
            for loop in f.loops:
                co = loop.vert.co
                u = 1.0 - max(0.0, min(1.0, (co.x - x0) / max(0.01, x1 - x0)))
                v = max(0.0, min(1.0, (co.z - z0) / max(0.01, z1 - z0)))
                loop[uv_layer].uv = (u, v)
        else:
            f.material_index = 0

    for f in bm_mat.faces:
        f.smooth = False

    # 为三块路牌面板背面补齐厚实的不透明钢结构背板 (RoadSignSteel, material_index = 0)，彻底防止从背面看到镜像透出的正面贴图
    back_plates = [
        ((-1.675, 0.04, 6.82), (1.98, 0.05, 1.96)),
        ((2.315, 0.04, 6.82), (2.98, 0.05, 1.96)),
        ((0.005, 0.12, 4.645), (0.98, 0.04, 1.68)),
    ]
    for center_pt, dims in back_plates:
        m_plate = Matrix.Translation(center_pt) @ Matrix.Diagonal((dims[0], dims[1], dims[2], 1.0))
        res = bmesh.ops.create_cube(bm_mat, size=1.0, matrix=m_plate)
        for v in res["verts"]:
            for f in v.link_faces:
                f.material_index = 0
                f.smooth = False

    bm_mat.to_mesh(obj_base.data)
    bm_mat.free()

    # 变体 1：单侧悬臂路牌 (user_road_sign_single.glb)
    # 立柱位于右侧路肩，向右侧车道上方 (+X) 伸出 3.8m 长悬臂路牌，正面朝向玩家来车方向 (-Z)
    # 注意：仅裁剪 z > 5.65 的顶部左侧副牌，完整保留立柱中部 (3.81 <= z <= 5.48) 的矩形路牌，杜绝被误裁成单三角面
    single_obj = obj_base.copy()
    single_obj.data = obj_base.data.copy()
    bpy.context.collection.objects.link(single_obj)
    bm_s = bmesh.new()
    bm_s.from_mesh(single_obj.data)
    del_verts = [v for v in bm_s.verts if v.co.z > 5.65 and v.co.x < -0.32]
    if del_verts:
        bmesh.ops.delete(bm_s, geom=del_verts, context="VERTS")
    bm_s.to_mesh(single_obj.data)
    bm_s.free()
    export_only([single_obj], "user_road_sign_single.glb")

    # 变体 2：T 型双联悬臂路牌 (user_road_sign_twin_wing.glb)
    # 立柱位于 x = 0（路边），顶部搭载双联并排路牌，正面统一朝向玩家来车方向 (-Z)
    export_only([obj_base], "user_road_sign_twin_wing.glb")

    # 变体 3：跨双车道双向分流龙门架路牌 (user_road_sign_gantry.glb)
    # - 右侧车道上方 (x = -2.4m，玩家顺行车道)：路牌正面朝向玩家来车方向 (-Z / Blender +Y)
    # - 左侧车道上方 (x = +2.4m，对向来车车道)：路牌旋转 180° 正面朝向对向来车方向 (+Z / Blender -Y)！
    bm_g = bmesh.new()
    # 右侧顺行车道悬臂牌（立柱位于右侧路肩外 x = -6.3m，悬臂伸向右侧车道 x = -3.8m，正面朝向玩家来车 +Y）
    bm_right = bmesh.new()
    bm_right.from_mesh(obj_base.data)
    bmesh.ops.translate(bm_right, verts=bm_right.verts, vec=(-4.2, 0.0, 0.0))
    # 左侧对向车道悬臂牌（立柱位于左侧人行道 x = +6.3m，旋转 180° 使路牌正面朝向对向来车 -Y！）
    bm_left = bmesh.new()
    bm_left.from_mesh(obj_base.data)
    bmesh.ops.rotate(bm_left, verts=bm_left.verts, cent=(0.0, 0.0, 0.0), matrix=Matrix.Rotation(math.pi, 3, "Z"))
    bmesh.ops.translate(bm_left, verts=bm_left.verts, vec=(4.2, 0.0, 0.0))

    # 顶部横跨双车道的钢结构龙门架横梁 (x in [-4.2, +4.2], z = 6.75m)
    m_beam = Matrix.Translation((0.0, 0.0, 6.75)) @ Matrix.Diagonal((8.6, 0.24, 0.28, 1.0))
    bmesh.ops.create_cube(bm_g, size=1.0, matrix=m_beam)
    for f in bm_g.faces:
        f.material_index = 0

    mesh_tmp1 = bpy.data.meshes.new("TmpR")
    bm_right.to_mesh(mesh_tmp1)
    bm_right.free()
    bm_g.from_mesh(mesh_tmp1)

    mesh_tmp2 = bpy.data.meshes.new("TmpL")
    bm_left.to_mesh(mesh_tmp2)
    bm_left.free()
    bm_g.from_mesh(mesh_tmp2)

    mesh_gantry = bpy.data.meshes.new("RoadSignGantryMesh")
    bm_g.to_mesh(mesh_gantry)
    bm_g.free()
    obj_gantry = bpy.data.objects.new("RoadSignGantry", mesh_gantry)
    obj_gantry.data.materials.append(mat_steel)
    obj_gantry.data.materials.append(mat_face)
    bpy.context.collection.objects.link(obj_gantry)
    export_only([obj_gantry], "user_road_sign_gantry.glb")


def add_ground_support_legs(billboard_obj):
    """为大型广告牌左右两端补齐深入地下 z = -3.2m 的重型钢结构立柱与混凝土基座，彻底解决悬浮或单侧悬空问题"""
    import bmesh

    bmin, bmax = get_world_bounds([billboard_obj])
    size = bmax - bmin
    # 确保广告牌板面长轴沿 X 轴展开
    if size.y > size.x * 1.2:
        billboard_obj.rotation_euler = (0.0, 0.0, math.pi * 0.5)
        bpy.ops.object.select_all(action="DESELECT")
        billboard_obj.select_set(True)
        bpy.context.view_layer.objects.active = billboard_obj
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
        bmin, bmax = get_world_bounds([billboard_obj])
        size = bmax - bmin

    bm = bmesh.new()
    bm.from_mesh(billboard_obj.data)

    leg_x_positions = [bmin.x + size.x * 0.18, bmax.x - size.x * 0.18]
    cy = (bmin.y + bmax.y) * 0.5
    top_z = bmin.z + size.z * 0.55
    bot_z = -3.2  # 深入地面以下 3.2 米，任何斜坡或路肩均稳固接地
    leg_h = top_z - bot_z
    mid_z = (top_z + bot_z) * 0.5

    for lx in leg_x_positions:
        # 钢结构主立柱
        m_leg = Matrix.Translation((lx, cy, mid_z)) @ Matrix.Diagonal((0.28, 0.28, leg_h, 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m_leg)
        # 地面混凝土法兰墩座 (z = -1.5..+0.45m)
        m_pad = Matrix.Translation((lx, cy, -0.5)) @ Matrix.Diagonal((0.68, 0.68, 1.9, 1.0))
        bmesh.ops.create_cube(bm, size=1.0, matrix=m_pad)

    bm.to_mesh(billboard_obj.data)
    bm.free()


def process_tf2_billboards():
    clear_scene()
    bpy.ops.import_scene.gltf(filepath="/Users/yqg/Downloads/tf2_city_central.glb")
    downscale_images(512)

    all_meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]

    def find_by_mat(mat_substr):
        res = []
        for o in all_meshes:
            for slot in o.material_slots:
                if slot.material and mat_substr.lower() in slot.material.name.lower():
                    res.append(o)
                    break
        return res

    b1 = join_and_normalize(find_by_mat("miningbillboard002"), target_max_dim=11.5, name="BillboardTrussLarge")
    if b1:
        add_ground_support_legs(b1)
        export_only([b1], "user_billboard_truss_large.glb")

    b2 = join_and_normalize(find_by_mat("miningbillboard001"), target_max_dim=9.5, name="BillboardFrameMed")
    if b2:
        add_ground_support_legs(b2)
        export_only([b2], "user_billboard_frame_med.glb")

    b3 = join_and_normalize(find_by_mat("mvmmannco_lit_sign"), target_max_dim=10.5, name="BillboardLitMarquee")
    if b3:
        add_ground_support_legs(b3)
        export_only([b3], "user_billboard_lit_marquee.glb")


if __name__ == "__main__":
    process_road_sign_variants()
