"""
Blender 5.1 离线生成写实比例 City Pop 核心资产包：
1. nagai_palm_tall.glb / nagai_palm_curved.glb — 永井博《Vermeerist BEAMS》风格极修长羽状华盛顿棕榈树（含 18 片羽状复叶、每片 22 对独立 V 型羽片、环纹细树干）
2. highway_cobra_light_single.glb / highway_cobra_light_double.glb — 9米修长锥形镀锌钢杆 + 大跨度流线型鹅颈弯臂公路路灯
3. citypop_hotel_tower_a.glb / citypop_hotel_tower_b.glb / citypop_commercial_corner_c.glb — 80s 现代主义海景酒店塔楼与转角商业建筑（真实多层楼板、内凹深蓝玻璃幕墙、金属窗框格栅、挑空柱廊、观海阳台与屋顶设备层）
"""

import os
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

OUT_DIR = "/Users/yqg/Documents/Github/reCRT/public/citypop-glb"
os.makedirs(OUT_DIR, exist_ok=True)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, hex_color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    h = hex_color.lstrip("#")
    r, g, b = [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    # sRGB to linear approx
    r, g, b = r**2.2, g**2.2, b**2.2
    bsdf.inputs["Base Color"].default_value = (r, g, b, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def export_glb(filename):
    path = os.path.join(OUT_DIR, filename)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
    )
    print(f"Exported {filename} ({os.path.getsize(path)} bytes)")


def build_nagai_palm(filename, height=11.8, curve_x=1.25, curve_z=0.18):
    clear_scene()
    # 对齐参考图 1：暖沙赭石受光树干 + 墨黑背光树干 + 三阶硬边色彩分层羽叶（墨黑剪影底 / 翠绿中层 / 亮黄绿高光脉）
    mat_trunk_light = make_mat("TrunkSunOchre", "#DF9D58", roughness=0.65)
    mat_trunk_dark = make_mat("TrunkInkShadow", "#161820", roughness=0.85)
    mat_frond_highlight = make_mat("FrondSunLime", "#9CE04B", roughness=0.3)
    mat_frond_mid = make_mat("FrondEmerald", "#309846", roughness=0.4)
    mat_frond_silhouette = make_mat("FrondInkSilhouette", "#0C1E1B", roughness=0.7)

    # 1. 左右明暗分阶的竹节环纹细树干 + 顶部菠萝状菱形叶基球包 (Pineapple Husk Crown Ball)
    bm_trunk = bmesh.new()
    segs = 34
    sides = 12
    rings = []
    for i in range(segs + 1):
        t = i / segs
        cx = curve_x * (t**1.6)
        cz = curve_z * math.sin(t * math.pi)
        cy = t * height
        base_r = 0.23 * (1.0 - 0.45 * t)
        ring_notch = 0.018 if (i % 2 == 0) else -0.008
        r = max(0.095, base_r + ring_notch)

        ring_verts = []
        for s in range(sides):
            ang = (s / sides) * math.tau
            vx = cx + math.cos(ang) * r
            vy = cz + math.sin(ang) * r
            vz = cy
            ring_verts.append(bm_trunk.verts.new((vx, vy, vz)))
        rings.append(ring_verts)

    for i in range(segs):
        r0 = rings[i]
        r1 = rings[i + 1]
        for s in range(sides):
            s_next = (s + 1) % sides
            f = bm_trunk.faces.new([r0[s], r0[s_next], r1[s_next], r1[s]])
            # 左侧迎光面 (+X/前) 为暖赭石色，右侧背光面与环缝为墨黑色（复刻参考图 1 树干强烈的左右明暗对比！）
            ang_mid = ((s + 0.5) / sides) * math.tau
            is_shadow_side = math.cos(ang_mid) < -0.15 or (i % 4 == 0 and math.cos(ang_mid) < 0.35)
            f.material_index = 1 if is_shadow_side else 0

    # 顶部标志性的大号菠萝状菱形叶基球包（参考图 1 树冠正下方金赭色与墨黑交错的膨大球体，完全外露不被下垂叶遮挡）
    top_pos = Vector((curve_x, curve_z, height))
    husk_rings = 9
    for hr in range(husk_rings):
        ht0 = hr / husk_rings
        ht1 = (hr + 1) / husk_rings
        z0 = height - 1.35 + ht0 * 1.25
        z1 = height - 1.35 + ht1 * 1.25
        rad0 = 0.18 + math.sin(ht0 * math.pi) * 0.36 + (0.04 if hr % 2 == 0 else -0.02)
        rad1 = 0.18 + math.sin(ht1 * math.pi) * 0.36 + (0.04 if (hr + 1) % 2 == 0 else -0.02)
        m = Matrix.Translation((curve_x, curve_z, (z0 + z1) * 0.5))
        ret = bmesh.ops.create_cone(
            bm_trunk,
            cap_ends=True,
            cap_tris=False,
            segments=12,
            radius1=rad0,
            radius2=rad1,
            depth=(z1 - z0) * 1.06,
            matrix=m,
        )
        for v in ret["verts"]:
            for f in v.link_faces:
                # 菱形格状交错明暗块（复刻参考图 1 菠萝头肌理）
                ang_f = math.atan2(f.normal.y, f.normal.x)
                checker = (int((ang_f + math.pi) / (math.tau / 8)) + hr) % 2 == 0
                f.material_index = 1 if (checker or f.normal.x < -0.25) else 0

    mesh_trunk = bpy.data.meshes.new("PalmTrunk")
    bm_trunk.to_mesh(mesh_trunk)
    bm_trunk.free()
    obj_trunk = bpy.data.objects.new("PalmTrunk", mesh_trunk)
    obj_trunk.data.materials.append(mat_trunk_light)
    obj_trunk.data.materials.append(mat_trunk_dark)
    bpy.context.collection.objects.link(obj_trunk)

    # 2. 对齐参考图 1 的向上挺拔 V 字形喷泉状羽叶冠 + 三阶硬边色彩分层（墨黑剪影底衬 + 翠绿中层 + 亮黄绿迎光叶脊）
    bm_fronds = bmesh.new()

    # 中心实心墨黑叶丛基座（防止仰视时树冠根部漏光，复刻参考图 1 树冠底部浑厚的墨绿黑剪影团块）
    m_core = Matrix.Translation((curve_x, curve_z, height + 0.55))
    ret_core = bmesh.ops.create_cone(
        bm_fronds,
        cap_ends=True,
        cap_tris=True,
        segments=12,
        radius1=0.32,
        radius2=0.95,
        depth=1.15,
        matrix=m_core,
    )
    for v in ret_core["verts"]:
        for f in v.link_faces:
            f.material_index = 2

    num_fronds = 32
    for idx in range(num_fronds):
        az = (idx / num_fronds) * math.tau + (idx % 4) * 0.05
        layer = idx % 4
        # 全部羽叶均从菠萝球包顶端向上挺拔喷涌而出（V 字形轮廓，绝不向下倒挂遮挡菠萝头）
        if layer == 0:
            elev = 0.92  # 内圈高耸挺立的亮黄绿受光羽叶
            flen = 3.15
            droop = 0.42
            mat_idx = 0
        elif layer == 1:
            elev = 0.68  # 中上层翠绿主羽叶 + 亮黄绿中脉
            flen = 3.45
            droop = 0.65
            mat_idx = 1
        elif layer == 2:
            elev = 0.48  # 中层浓密墨黑剪影衬底羽叶
            flen = 3.55
            droop = 0.85
            mat_idx = 2
        else:
            elev = 0.32  # 外圈舒展的墨黑与翠绿梳齿剪影叶（仰角仍保持向上）
            flen = 3.35
            droop = 0.92
            mat_idx = 1 if (idx % 8 == 3) else 2

        steps = 16
        dir_x = math.cos(az)
        dir_y = math.sin(az)
        side_x = -dir_y
        side_y = dir_x

        spine_pts = []
        for st in range(steps + 1):
            u = st / steps
            dist = u * flen
            # 先向上高高扬起，仅在叶尖 30% 处优雅外弯
            z_off = math.sin(elev) * dist - droop * (u**2.6)
            r_off = math.cos(elev) * dist * (1.0 + 0.12 * u)
            p = top_pos + Vector((dir_x * r_off, dir_y * r_off, z_off))
            spine_pts.append(p)

        # 构建具有立体厚度的亮黄绿/翠绿硬朗叶柄中脉 (Bright Sunlit Central Rachis Spine)
        spine_mat = 0 if layer in (0, 1) else 1
        for st in range(steps - 1):
            p0 = spine_pts[st]
            p1 = spine_pts[st + 1]
            w = 0.065 * (1.0 - 0.65 * (st / steps))
            v0 = bm_fronds.verts.new(p0 + Vector((side_x * w, side_y * w, 0.03)))
            v1 = bm_fronds.verts.new(p0 + Vector((-side_x * w, -side_y * w, 0.03)))
            v2 = bm_fronds.verts.new(p1 + Vector((-side_x * w * 0.8, -side_y * w * 0.8, 0.03)))
            v3 = bm_fronds.verts.new(p1 + Vector((side_x * w * 0.8, side_y * w * 0.8, 0.03)))
            f_sp = bm_fronds.faces.new([v0, v1, v2, v3])
            f_sp.material_index = spine_mat

        # 构建斜向垂挂的密集梳齿状羽片 (Comb-Tooth Pinnate Leaflets)，使仰视与平视视角都能看到饱满的羽叶层次
        for st in range(1, steps):
            u0 = st / steps
            p0 = spine_pts[st]
            p1 = p0.lerp(spine_pts[st + 1], 0.78)
            span = (math.sin(u0 * math.pi * 0.92) * 0.72 + 0.10) * (1.08 if mat_idx == 2 else 0.92)

            for sign in (-1.0, 1.0):
                v_in0 = bm_fronds.verts.new(p0)
                v_in1 = bm_fronds.verts.new(p1)
                v_tip = bm_fronds.verts.new(
                    p0
                    + Vector(
                        (
                            side_x * sign * span * 0.78 + dir_x * (span * 0.38),
                            side_y * sign * span * 0.78 + dir_y * (span * 0.38),
                            -span * 0.58 if mat_idx == 2 else span * 0.18,
                        )
                    )
                )
                f = bm_fronds.faces.new([v_in0, v_in1, v_tip])
                f.material_index = mat_idx

    mesh_fronds = bpy.data.meshes.new("PalmFronds")
    bm_fronds.to_mesh(mesh_fronds)
    bm_fronds.free()
    obj_fronds = bpy.data.objects.new("PalmFronds", mesh_fronds)
    obj_fronds.data.materials.append(mat_frond_highlight)
    obj_fronds.data.materials.append(mat_frond_mid)
    obj_fronds.data.materials.append(mat_frond_silhouette)
    bpy.context.collection.objects.link(obj_fronds)

    export_glb(filename)


def build_highway_streetlight(filename, double_arm=False):
    clear_scene()
    mat_steel = make_mat("PoleSteel", "#E8EDF5", roughness=0.35, metallic=0.4)
    mat_dark = make_mat("PoleDark", "#1C2436", roughness=0.6)
    mat_lamp_glow = make_mat("LampGlow", "#FFF59E", roughness=0.1)

    bm = bmesh.new()

    def add_cyl(r1, r2, h, segs, mat_idx, m):
        ret = bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=h, matrix=m
        )
        for v in ret["verts"]:
            for f in v.link_faces:
                f.material_index = mat_idx

    # 1. 八角法兰底座 + 9.0m 修长锥形主灯杆
    add_cyl(0.22, 0.16, 0.65, 8, 1, Matrix.Translation((0, 0, 0.325)))
    add_cyl(0.11, 0.055, 8.6, 10, 0, Matrix.Translation((0, 0, 4.6)))

    # 2. 流线型大跨度鹅颈弯臂与扁平高压钠灯灯头
    arms = [-1, 1] if double_arm else [1]
    for d in arms:
        arm_segs = 10
        span = 2.85
        rise = 0.85
        pts = []
        for i in range(arm_segs + 1):
            t = i / arm_segs
            x = d * (t * span)
            z = 8.4 + math.sin(t * math.pi * 0.62) * rise
            pts.append(Vector((x, 0, z)))
        for i in range(arm_segs):
            p0, p1 = pts[i], pts[i + 1]
            mid = (p0 + p1) * 0.5
            vec = p1 - p0
            length = vec.length
            rot = Vector((0, 0, 1)).rotation_difference(vec.normalized()).to_matrix().to_4x4()
            m = Matrix.Translation(mid) @ rot
            add_cyl(0.038, 0.032, length + 0.02, 8, 0, m)

        # 扁平流线型灯头外壳 + 底部发光面
        tip = pts[-1]
        bmesh.ops.create_cube(
            bm,
            size=1.0,
            matrix=Matrix.Translation(tip + Vector((d * 0.25, 0, 0.02)))
            @ Matrix.Diagonal((0.72, 0.28, 0.12, 1.0)),
        )
        for f in bm.faces[-6:]:
            f.material_index = 1 if f.normal.z >= -0.5 else 2

    mesh = bpy.data.meshes.new("HighwayLight")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("HighwayLight", mesh)
    obj.data.materials.append(mat_steel)
    obj.data.materials.append(mat_dark)
    obj.data.materials.append(mat_lamp_glow)
    bpy.context.collection.objects.link(obj)

    export_glb(filename)


def add_box(bm, center, size, mat_idx):
    m = Matrix.Translation(center) @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    ret = bmesh.ops.create_cube(bm, size=1.0, matrix=m)
    faces = list({f for v in ret["verts"] for f in v.link_faces})
    for f in faces:
        f.material_index = mat_idx


def build_modernist_hotel_tower(
    filename,
    floors=11,
    width=14.0,
    depth=14.0,
    wall_hex="#F7F3E8",
    accent_hex="#1858D6",
    balcony_hex="#36A2F8",
    has_globe=True,
):
    clear_scene()
    mat_wall = make_mat("WallConcrete", wall_hex, roughness=0.6)
    mat_glass_dark = make_mat("CurtainGlassDark", "#093B94", roughness=0.15, metallic=0.2)
    mat_glass_refl = make_mat("CurtainGlassRefl", "#52B8FF", roughness=0.15)
    mat_accent = make_mat("ArchAccent", accent_hex, roughness=0.45)
    mat_balcony = make_mat("BalconyRail", balcony_hex, roughness=0.4)
    mat_dark_frame = make_mat("MullionDark", "#121722", roughness=0.7)

    bm = bmesh.new()
    floor_h = 3.2
    podium_h = 4.6
    total_h = podium_h + floors * floor_h

    # 1. 首层挑空现代主义商业裙房 (Ground Colonnade & Podium)
    add_box(bm, (0, 0, podium_h * 0.5), (width * 0.92, depth * 0.92, podium_h), 1)
    # 沿街立柱 (Pilotis Columns)
    for ix in (-1, -0.33, 0.33, 1):
        for iy in (-1, 1):
            add_box(
                bm,
                (ix * (width * 0.45), iy * (depth * 0.45), podium_h * 0.5),
                (0.55, 0.55, podium_h),
                0,
            )
    # 裙房顶挑檐雨棚 (Cantilevered Canopy)
    add_box(bm, (0, 0, podium_h + 0.32), (width * 1.08, depth * 1.08, 0.65), 3)

    # 2. 标准层：深蓝玻璃幕墙核 + 凸出水平层间梁 + 竖向金属窗框格栅 + 转角观海挑台
    core_w = width * 0.88
    core_d = depth * 0.88
    tower_h = floors * floor_h
    add_box(
        bm,
        (0, 0, podium_h + tower_h * 0.5),
        (core_w, core_d, tower_h),
        1,
    )

    # 每层水平楼板腰线、阳台挑板与玻璃反光色块（产生极丰富的建筑折痕边线！）
    cols = 5
    for fl in range(floors + 1):
        z_slab = podium_h + fl * floor_h
        # 水平层间退台挑板
        add_box(bm, (0, 0, z_slab), (width, depth, 0.38), 0)

        # 正立面与侧立面观海阳台天蓝护栏板
        if fl < floors and fl % 2 == 0:
            add_box(
                bm,
                (-width * 0.51, 0, z_slab + 0.62),
                (0.24, depth * 0.76, 0.88),
                4,
            )
            add_box(
                bm,
                (0, -depth * 0.51, z_slab + 0.62),
                (width * 0.76, 0.24, 0.88),
                4,
            )

        # 幕墙亮天蓝高光玻璃窗格
        if fl < floors:
            for c in range(cols):
                if (fl + c) % 3 == 0:
                    wy = (c - (cols - 1) * 0.5) * (core_d / cols)
                    add_box(
                        bm,
                        (-core_w * 0.5 - 0.04, wy, z_slab + floor_h * 0.5),
                        (0.08, (core_d / cols) * 0.72, floor_h * 0.76),
                        2,
                    )

    # 竖向建筑幕墙立柱 (Vertical Mullions & Corner Fins)
    for c in range(cols + 1):
        t = c / cols - 0.5
        # 左右立面竖框
        add_box(
            bm,
            (-width * 0.46, t * core_d, podium_h + tower_h * 0.5),
            (0.28, 0.24, tower_h),
            0,
        )
        add_box(
            bm,
            (width * 0.46, t * core_d, podium_h + tower_h * 0.5),
            (0.28, 0.24, tower_h),
            0,
        )
        # 前后立面竖框
        add_box(
            bm,
            (t * core_w, -depth * 0.46, podium_h + tower_h * 0.5),
            (0.24, 0.28, tower_h),
            0,
        )
        add_box(
            bm,
            (t * core_w, depth * 0.46, podium_h + tower_h * 0.5),
            (0.24, 0.28, tower_h),
            0,
        )

    # 3. 屋顶退台设备层、电梯机房与 80s 标志性天蓝网格球体/钢桁架塔（参考图 1 & 图 6）
    add_box(bm, (0, 0, total_h + 1.4), (width * 0.58, depth * 0.58, 2.8), 0)
    add_box(bm, (0, 0, total_h + 2.95), (width * 0.64, depth * 0.64, 0.35), 3)

    if has_globe:
        bmesh.ops.create_icosphere(
            bm,
            subdivisions=2,
            radius=2.3,
            matrix=Matrix.Translation((0, 0, total_h + 5.8)),
        )
        for f in bm.faces[-80:]:
            f.material_index = 4
        # 环绕球体的明黄倾斜环带
        add_box(bm, (0, 0, total_h + 5.8), (5.6, 5.6, 0.35), 3)
    else:
        # 屋顶无线电信号铁塔
        add_box(bm, (0, 0, total_h + 5.8), (0.35, 0.35, 6.0), 5)
        add_box(bm, (0, 0, total_h + 7.2), (2.4, 0.18, 0.18), 5)

    mesh = bpy.data.meshes.new("ModernistHotel")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("ModernistHotel", mesh)
    for m in (mat_wall, mat_glass_dark, mat_glass_refl, mat_accent, mat_balcony, mat_dark_frame):
        obj.data.materials.append(m)
    bpy.context.collection.objects.link(obj)

    export_glb(filename)


def build_suburban_motel(filename):
    clear_scene()
    mat_wall = make_mat("StuccoWall", "#FFFDF7", roughness=0.6)
    mat_glass_dark = make_mat("WindowNavy", "#08296C", roughness=0.15)
    mat_shutter = make_mat("LouverShutter", "#B8C7DC", roughness=0.5)
    mat_door_wood = make_mat("DoorOrange", "#E8842C", roughness=0.45)
    mat_trim_red = make_mat("MotelRed", "#D9232E", roughness=0.4)
    mat_dark = make_mat("FrameDark", "#121722", roughness=0.7)

    bm = bmesh.new()
    w, d, h = 8.4, 16.8, 5.8
    # 主体建筑 + 顶部女儿墙挑檐
    add_box(bm, (0, 0, h * 0.5), (w, d, h), 0)
    add_box(bm, (0, 0, h + 0.25), (w + 0.45, d + 0.45, 0.5), 0)
    add_box(bm, (-w * 0.5 - 0.85, 0, 3.65), (1.7, d * 0.94, 0.28), 4)

    # 正立面 (-X) 挑空廊柱
    for iy in (-7.2, -2.4, 2.4, 7.2):
        add_box(bm, (-w * 0.5 - 1.45, iy, 1.82), (0.28, 0.28, 3.65), 0)

    # 深钴蓝内凹窗 + 两侧百叶窗板 (Louvered Shutters)
    for wy in (-5.2, -0.8):
        add_box(bm, (-w * 0.5 - 0.04, wy, 2.1), (0.12, 3.1, 2.0), 1)
        add_box(bm, (-w * 0.5 - 0.08, wy - 1.85, 2.1), (0.14, 0.52, 2.0), 2)
        add_box(bm, (-w * 0.5 - 0.08, wy + 1.85, 2.1), (0.14, 0.52, 2.0), 2)
        # 窗台挑板
        add_box(bm, (-w * 0.5 - 0.16, wy, 1.02), (0.32, 3.9, 0.18), 0)

    # 暖橙色并列旅馆木门 + 门框格栅
    for dy in (3.2, 4.4, 5.6, 6.8):
        add_box(bm, (-w * 0.5 - 0.05, dy, 1.65), (0.14, 0.98, 3.1), 3)
        add_box(bm, (-w * 0.5 - 0.09, dy, 2.35), (0.16, 0.72, 0.95), 1)

    # 墙面外挂复古空调机箱 (AC Unit)
    add_box(bm, (-w * 0.5 - 0.35, 1.6, 3.1), (0.65, 0.95, 0.62), 2)

    mesh = bpy.data.meshes.new("SuburbanMotel")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("SuburbanMotel", mesh)
    for m in (mat_wall, mat_glass_dark, mat_shutter, mat_door_wood, mat_trim_red, mat_dark):
        obj.data.materials.append(m)
    bpy.context.collection.objects.link(obj)
    export_glb(filename)


def build_distant_island_peninsula(filename):
    clear_scene()
    mat_mountain = make_mat("IslandMountainUnified", "#345B7A", roughness=0.7)
    mat_town_white = make_mat("HarborTownWhite", "#FAF7F0", roughness=0.4)
    mat_town_Shadow = make_mat("HarborTownShadow", "#6B88B2", roughness=0.5)

    bm = bmesh.new()

    # 1. 构建具有强烈棱角折面感的远山与海岛双层山脉网格（复刻参考图 2 & 图 3 的多脊线折面远山）
    nx, ny = 64, 28
    span_x = 340.0
    span_y = 125.0
    grid_verts = []

    # 预设连绵起伏、宽阔自然的远山与海岛山脊群 (u_peak, v_peak, height, span_u, span_v)
    peaks = [
        # 前排中景海湾岛屿连绵山脊（参考图 2 的舒展横向海岛山峦）
        (0.16, 0.34, 21.0, 0.16, 0.28),
        (0.34, 0.38, 34.0, 0.22, 0.30),
        (0.51, 0.36, 27.0, 0.19, 0.28),
        (0.67, 0.34, 22.0, 0.17, 0.26),
        # 后排远景高山脊（参考图 1 & 图 3 的连绵折面远山，高度适中、山脊宽阔相连）
        (0.11, 0.72, 36.0, 0.19, 0.36),
        (0.28, 0.76, 48.0, 0.24, 0.38),
        (0.46, 0.74, 42.0, 0.22, 0.36),
        (0.63, 0.78, 45.0, 0.23, 0.38),
        (0.80, 0.72, 33.0, 0.19, 0.34),
    ]

    for iy in range(ny + 1):
        v = iy / ny  # 0 = 前沿海岸水际线, 1 = 远景高山后麓
        row = []
        for ix in range(nx + 1):
            u = ix / nx
            x = (u - 0.5) * span_x
            y = (v - 0.28) * span_y

            # 采用平滑连绵的山脊包络 + 柔和山体支脉，配合顶点平滑法线 (f.smooth = True)，彻底杜绝单块三角面法线突变造成的破面色块
            z_peak = 0.0
            for pu, pv, ph, su, sv in peaks:
                du = abs(u - pu) / su
                dv = abs(v - pv) / sv
                spur = math.sin((u - pu) * 16.0 + (v - pv) * 9.0) * 0.06
                dist_ridge = (du ** 1.05) * 0.72 + (dv ** 1.12) * 0.56 + spur
                tent = max(0.0, 1.0 - dist_ridge)
                z_peak = max(z_peak, (tent ** 1.15) * ph)

            rib = (
                math.sin(u * 20.0 + v * 7.0) * 1.6
                + math.cos(u * 32.0 - v * 9.0) * 0.9
            ) * min(1.0, z_peak / 16.0)

            z = max(0.0, z_peak + rib)
            edge_fade = (
                min(1.0, max(0.0, (v - 0.02) / 0.09))
                * min(1.0, max(0.0, (0.96 - u) / 0.08))
                * min(1.0, max(0.0, (u - 0.02) / 0.06))
            )
            z *= edge_fade

            row.append(bm.verts.new((x, y, z)))
        grid_verts.append(row)

    for iy in range(ny):
        for ix in range(nx):
            v00 = grid_verts[iy][ix]
            v10 = grid_verts[iy][ix + 1]
            v01 = grid_verts[iy + 1][ix]
            v11 = grid_verts[iy + 1][ix + 1]

            for tri in ((v00, v10, v11), (v00, v11, v01)):
                f = bm.faces.new(tri)
                f.smooth = True
                f.material_index = 0

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new("DistantIsland")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("DistantIsland", mesh)
    obj.data.materials.append(mat_mountain)
    bpy.context.collection.objects.link(obj)

    export_glb(filename)


def build_yacht_curling_splash(filename):
    clear_scene()
    mat_foam = make_mat("SplashFoamWhite", "#FFFDF8", roughness=0.3)
    mat_curl_cyan = make_mat("SplashCurlCyan", "#268EF2", roughness=0.35)
    mat_deep_shadow = make_mat("SplashDeepNavy", "#002A6E", roughness=0.5)

    bm = bmesh.new()

    def add_puff(center, rx, ry, rz, mat_idx, rot_y=0.0, rot_z=0.0):
        m = (
            Matrix.Translation(center)
            @ Matrix.Rotation(rot_z, 4, "Z")
            @ Matrix.Rotation(rot_y, 4, "Y")
            @ Matrix.Diagonal((rx, ry, rz, 1.0))
        )
        ret = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0, matrix=m)
        faces = list({f for v in ret["verts"] for f in v.link_faces})
        for f in faces:
            f.material_index = mat_idx

    # 1. 左右对称向外翻卷的 V 型破浪主浪冠与花椰菜泡沫球簇 (y 为前进方向: +3.2 船首 -> -8.5 船尾)
    for side in (-1.0, 1.0):
        steps = 18
        for i in range(steps):
            t = i / (steps - 1)  # 0 = 船首分水点, 1 = 船尾远端
            y = 3.2 - t * 11.5
            # V 型展开轨迹 + 波浪摆动
            x_base = side * (0.75 + (t**0.82) * 3.85 + math.sin(t * math.pi * 3.0) * 0.18)

            # 浪花高度在船身中前段 (t ≈ 0.22) 翻卷最高，向船尾逐渐平缓铺开
            arch_h = math.sin(min(1.0, t * 1.25) * math.pi)
            z_crest = 0.22 + arch_h * 0.88 * (1.0 - t * 0.45)
            puff_r = 0.34 + arch_h * 0.48 * (1.0 - t * 0.3)

            # A. 顶部与外侧翻滚的雪白花椰菜浪冠球 (mat 0: 暖白)
            add_puff(
                (x_base, y, z_crest),
                puff_r * 1.05,
                puff_r * 1.35,
                puff_r * 0.72,
                0,
                rot_y=side * 0.42,
                rot_z=-side * 0.32,
            )

            # B. 浪冠外沿次级滚边白泡（营造《Yacht World》高低错落的波浪花边）
            if i % 2 == 0:
                add_puff(
                    (x_base + side * puff_r * 0.65, y - 0.15, z_crest * 0.55),
                    puff_r * 0.78,
                    puff_r * 0.95,
                    puff_r * 0.48,
                    0,
                )

            # C. 浪花内侧与下腹的亮天蓝色卷浪凹面 (mat 1: #268EF2，复刻《Tasty Jam》标志性蓝白浪层)
            if 0.08 < t < 0.78:
                add_puff(
                    (x_base - side * puff_r * 0.42, y - 0.08, z_crest * 0.62),
                    puff_r * 0.82,
                    puff_r * 1.15,
                    puff_r * 0.58,
                    1,
                    rot_y=side * 0.25,
                )

            # D. 浪底贴水深群青暗部托底 (mat 2: #002A6E)
            if t < 0.72:
                add_puff(
                    (x_base + side * puff_r * 0.85, y, 0.12),
                    puff_r * 0.95,
                    puff_r * 1.2,
                    0.12,
                    2,
                )

            # E. 浪尖向上飞溅的独立水花滴 (Flying Spray Droplets)
            if i in (2, 4, 6, 9, 12):
                add_puff(
                    (
                        x_base + side * (0.45 + (i % 3) * 0.22),
                        y + 0.1,
                        z_crest + 0.45 + (i % 2) * 0.22,
                    ),
                    0.16,
                    0.22,
                    0.14,
                    0,
                )

    # 2. 船尾中央螺旋桨翻涌白沫带 (y in [-2.2 .. -9.5])
    for k in range(10):
        tk = k / 9.0
        yk = -2.2 - tk * 7.2
        xk = math.sin(k * 1.7) * 0.55 * (1.0 - tk * 0.4)
        rk = (0.68 - tk * 0.35)
        add_puff((xk, yk, 0.18), rk * 1.25, rk * 1.6, 0.18, 0 if k % 3 != 2 else 1)

    mesh = bpy.data.meshes.new("YachtSplash")
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new("YachtSplash", mesh)
    obj.data.materials.append(mat_foam)
    obj.data.materials.append(mat_curl_cyan)
    obj.data.materials.append(mat_deep_shadow)
    bpy.context.collection.objects.link(obj)
    export_glb(filename)


if __name__ == "__main__":
    build_yacht_curling_splash("citypop_yacht_splash.glb")
    build_distant_island_peninsula("citypop_distant_island.glb")
    build_nagai_palm("nagai_palm_tall.glb", height=12.2, curve_x=1.65, curve_z=0.22)
    build_nagai_palm("nagai_palm_curved.glb", height=10.4, curve_x=-1.95, curve_z=0.35)
    build_highway_streetlight("highway_cobra_light_single.glb", double_arm=False)
    build_highway_streetlight("highway_cobra_light_double.glb", double_arm=True)
    build_suburban_motel("citypop_suburban_motel.glb")
    build_modernist_hotel_tower(
        "citypop_hotel_tower_a.glb",
        floors=11,
        width=13.5,
        depth=14.5,
        wall_hex="#FAF6EB",
        accent_hex="#1750D6",
        balcony_hex="#36A2F8",
        has_globe=True,
    )
    build_modernist_hotel_tower(
        "citypop_hotel_tower_b.glb",
        floors=14,
        width=12.5,
        depth=13.5,
        wall_hex="#E2F0FF",
        accent_hex="#EE4256",
        balcony_hex="#FFBD1B",
        has_globe=False,
    )
    build_modernist_hotel_tower(
        "citypop_commercial_corner_c.glb",
        floors=7,
        width=15.0,
        depth=15.5,
        wall_hex="#FFE2EC",
        accent_hex="#1750D6",
        balcony_hex="#29B2E8",
        has_globe=False,
    )
    build_modernist_hotel_tower(
        "user_sf_bldg_1.glb",
        floors=10,
        width=14.0,
        depth=14.0,
        wall_hex="#F4EFE6",
        accent_hex="#2268D8",
        balcony_hex="#4EB8F5",
        has_globe=False,
    )
    build_modernist_hotel_tower(
        "user_sf_bldg_2.glb",
        floors=13,
        width=13.0,
        depth=14.0,
        wall_hex="#EBF5FF",
        accent_hex="#E83858",
        balcony_hex="#34A8F2",
        has_globe=True,
    )
