# Brygga mellan alex_clothes och Blender + Sollumz.
#
#   blender -b --python blender_bridge.py -- convert <ut.glb> <fil1.ydd> [fil2 ...]
#   blender -b --python blender_bridge.py -- ytd <utmapp> <ytd-namn> <bild1.png> [bild2 ...]
#   blender    --python blender_bridge.py -- edit <fil.ydd> <utmapp>
#
# Skriver "ALEX_OK <info>" eller "ALEX_ERR <meddelande>" på stdout så att appen kan läsa resultatet.

import math
import os
import sys
import traceback

import addon_utils
import bpy

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []

# Bakgrundskörningar får aldrig skriva över användarens Blender-inställningar.
if bpy.app.background:
    try:
        bpy.context.preferences.use_preferences_save = False
    except Exception:
        pass
NATIVE = {"use_custom_settings": True, "target_formats": {"NATIVE"}, "target_versions": {"GEN8"}}
# Klädmodeller exporteras utan eget skelett – de använder freemode-gubbens (.yft) in game.
PED_EXPORT = {**NATIVE, "exclude_skeleton": True}


def ok(msg=""):
    print(f"ALEX_OK {msg}", flush=True)


def err(msg):
    print(f"ALEX_ERR {msg}", flush=True)


def sollumz_ready():
    try:
        bpy.ops.sollumz.import_assets.get_rna_type()
    except Exception:
        return False
    # Sollumz registrerar sina egna egenskaper på objekt – saknas de har tillägget bara startat till hälften.
    return hasattr(bpy.types.Object, "sollum_type")


def enable_sollumz():
    """Slår på Sollumz även om det är avstängt i Blenders inställningar.
    default_set=True krävs: Sollumz läser sina inställningar ur preferences.addons när det startar,
    och utan den posten startar det bara till hälften (KeyError 'Sollumz' / saknad sollum_type)."""
    if sollumz_ready():
        return
    mods = [m for m in addon_utils.modules() if "sollumz" in m.__name__.lower()]
    if not mods:
        raise RuntimeError("Sollumz är inte installerat i Blender. Installera det från github.com/Sollumz/Sollumz.")
    name = mods[0].__name__
    # Stäng av en halvstartad version först, annars registreras inget på nytt.
    try:
        addon_utils.disable(name, default_set=False)
    except Exception:
        pass
    addon_utils.enable(name, default_set=True, handle_error=lambda e: traceback.print_exc())
    if not sollumz_ready():
        raise RuntimeError("Sollumz kunde inte startas i Blender. Öppna Blender › Edit › Preferences › Add-ons och slå på Sollumz, eller installera om det.")


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures):
        for item in list(block):
            block.remove(item)


def import_files(paths, tolerant=False):
    """tolerant=True: filer som inte går att läsa hoppas över (returneras), resten läses in ändå."""
    failed = []
    for p in paths:
        # Först med freemode-skelettet (rätt viktning). Props och annat som inte är viktat mot
        # hela skelettet klarar inte det – då läses filen in utan skelett.
        for skeleton in ("FROM_DIR", "NO"):
            before = set(bpy.data.objects)
            try:
                res = bpy.ops.sollumz.import_assets(
                    directory=os.path.dirname(p) + os.sep,
                    files=[{"name": os.path.basename(p)}],
                    use_custom_settings=True,
                    dwd_import_external_skeleton=skeleton,
                    textures_mode="PACK",
                )
            except Exception:
                res = set()
            new = set(bpy.data.objects) - before
            if "FINISHED" in res and any(o.type == "MESH" for o in new):
                break
            for o in new:
                bpy.data.objects.remove(o)
        else:
            if not tolerant:
                raise RuntimeError(f"Sollumz kunde inte läsa {os.path.basename(p)}")
            failed.append(os.path.basename(p))
    if tolerant and len(failed) == len(paths):
        raise RuntimeError("Sollumz kunde inte läsa någon av filerna: " + ", ".join(failed))
    return failed


def hide_helpers():
    # Kollisioner, LOD:er och liknande ska inte synas i förhandsvisningen.
    for obj in list(bpy.data.objects):
        st = getattr(obj, "sollum_type", "")
        name = obj.name.lower()
        if obj.type == "MESH" and (st.startswith("sollumz_bound") or "_med" in name or "_low" in name or "_vlow" in name):
            bpy.data.objects.remove(obj)


def cmd_convert(out, inputs):
    import json
    clear_scene()
    # En gubbe består av flera delar – om en del inte går att läsa visas resten ändå.
    skipped = import_files(inputs, tolerant=True)
    if skipped:
        print("ALEX_INFO " + json.dumps({"skipped": skipped}), flush=True)
    hide_helpers()
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_animations=False,
        export_skins=False,
        export_morph=False,
    )
    ok(out)


def cmd_ytd(out_dir, name, images):
    clear_scene()
    txds = bpy.context.scene.sz_txds
    while len(txds.texture_dictionaries):
        txds.texture_dictionaries.remove(0)
    txd = txds.new_texture_dictionary(name)
    for path in images:
        img = bpy.data.images.load(path)
        img.name = os.path.splitext(os.path.basename(path))[0]
        img.filepath_raw = path
        txd.new_texture(img)
    res = bpy.ops.sollumz.export_ytd(directory=out_dir + os.sep, direct_export=True, **NATIVE)
    target = os.path.join(out_dir, name + ".ytd")
    if "FINISHED" not in res or not os.path.exists(target):
        raise RuntimeError("Sollumz kunde inte skapa .ytd")
    ok(target)


def diffuse_node(mat):
    """Bildnoden för diffuse-texturen i ett Sollumz-material."""
    if not mat or not mat.node_tree:
        return None
    nodes = [n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE"]
    for n in nodes:
        if n.name.lower().startswith("diffusesampler") or "diff" in (n.image.name.lower() if n.image else ""):
            return n
    return nodes[0] if nodes else None


def tex_key(name):
    name = name.lower().split("^")[-1]
    for ext in (".dds", ".png", ".tga"):
        name = name.replace(ext, "")
    # Blender lägger till .001 på dubbletter.
    parts = name.split(".")
    return parts[0]


def material_keys():
    names = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for s in obj.material_slots:
            n = diffuse_node(s.material)
            if n and n.image:
                k = tex_key(n.image.name)
                if k not in names:
                    names.append(k)
    return names


def cmd_batch(jobs_path):
    """Konverterar många plagg i en och samma Blender-start. jobs: [{inputs: [...], glb: path}]"""
    import json
    jobs = json.load(open(jobs_path, encoding="utf-8"))
    for i, job in enumerate(jobs):
        try:
            clear_scene()
            import_files(job["inputs"])
            mats = material_keys()
            hide_helpers()
            bpy.ops.export_scene.gltf(filepath=job["glb"], export_format="GLB", export_yup=True, export_apply=True,
                                      export_animations=False, export_skins=False, export_morph=False)
            print("ALEX_DONE " + json.dumps({"i": i, "materials": mats}), flush=True)
        except Exception as e:
            print("ALEX_FAIL " + json.dumps({"i": i, "error": str(e)}), flush=True)
    ok(str(len(jobs)))


def sampler(mat, name):
    if not mat or not mat.node_tree:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.name.startswith(name)), None)


def write_dds(path, rgba, w, h):
    """Okomprimerad A8R8G8B8 DDS. rgba: float-array (h, w, 4) med origo nere till vänster."""
    import numpy as np
    import struct
    px = (np.clip(rgba[::-1], 0, 1) * 255 + 0.5).astype(np.uint8)
    bgra = px[..., [2, 1, 0, 3]].tobytes()
    head = struct.pack("<4sIIIIIII44xIIIIIIIII16x", b"DDS ", 124, 0x100F, h, w, w * 4, 0, 1,
                       32, 0x41, 0, 32, 0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000, 0x1000)
    with open(path, "wb") as f:
        f.write(head + bgra)


# Neutrala värden för ytor som saknar egen karta: platt normal och ingen glans.
EXTRA_SAMPLERS = {"BumpSampler": (0.5, 0.5, 1.0, 1.0), "SpecSampler": (0.0, 0.0, 0.0, 1.0)}
EXTRA_MAX = 1024


def cmd_merge(ydd, out_dir, spec_path):
    """Slår ihop flera texturer till en: flyttar varje materials UV till sin ruta i atlasen och låter
    alla ytor använda huvudmaterialet, så att plagget fungerar med en .ytd per färgvariant.
    Inbäddade normal- och spec-kartor slås ihop med samma rutor."""
    import json
    import numpy as np
    spec = json.load(open(spec_path, encoding="utf-8"))
    tiles = {k.lower(): v for k, v in spec["tiles"].items()}
    clear_scene()
    import_files([ydd])

    meshes = [o for o in bpy.data.objects if o.type == "MESH" and o.data.uv_layers]
    mats = {}
    for obj in meshes:
        for slot in obj.material_slots:
            node = diffuse_node(slot.material)
            if node and node.image:
                mats.setdefault(tex_key(node.image.name), slot.material)
    missing = [k for k in tiles if k not in mats]
    if missing:
        raise RuntimeError("Hittar inte texturerna i modellen: " + ", ".join(missing))
    primary = spec.get("primary", "").lower()
    target = mats.get(primary) or mats[next(iter(tiles))]
    primary = next(k for k, m in mats.items() if m == target)

    # 1. Normal- och spec-kartor i samma rutor (bara om huvudmaterialet har inbäddade sådana).
    tmp = os.path.join(out_dir, "_tmp")
    os.makedirs(tmp, exist_ok=True)
    for sname, default in EXTRA_SAMPLERS.items():
        tnode = sampler(target, sname)
        if not (tnode and tnode.image and tnode.image.size[0] > 0 and getattr(tnode.texture_properties, "embedded", False)):
            continue
        ptile = tiles[primary]
        W = min(EXTRA_MAX, 1 << max(2, round(math.log2(max(4, tnode.image.size[0] / ptile[2])))))
        H = min(EXTRA_MAX, 1 << max(2, round(math.log2(max(4, tnode.image.size[1] / ptile[3])))))
        buf = np.empty((H, W, 4), dtype=np.float32)
        buf[:] = default
        for key, (ox, oy, sx, sy) in tiles.items():
            src_node = sampler(mats[key], sname)
            src = src_node.image if src_node and src_node.image and src_node.image.size[0] > 0 else None
            x0, y0 = int(round(ox * W)), int(round(oy * H))
            w, h = max(1, int(round(sx * W))), max(1, int(round(sy * H)))
            if src is None:
                continue
            c = src.copy()
            c.scale(w, h)
            px = np.empty(w * h * 4, dtype=np.float32)
            c.pixels.foreach_get(px)
            buf[y0:y0 + h, x0:x0 + w] = px.reshape(h, w, 4)[: H - y0, : W - x0]
            bpy.data.images.remove(c)
        name = f"{spec['atlas']}_{'n' if sname == 'BumpSampler' else 's'}"
        path = os.path.join(tmp, name + ".dds")
        write_dds(path, buf, W, H)
        img = bpy.data.images.load(path)
        img.name = name
        img.colorspace_settings.name = "Non-Color"
        tnode.image = img

    # 2. Flytta UV:erna in i rutorna.
    moved = 0
    outside = set()
    for obj in meshes:
        mesh = obj.data
        uv = mesh.uv_layers[0].data
        slot_tile = {}
        for i, slot in enumerate(obj.material_slots):
            node = diffuse_node(slot.material)
            key = tex_key(node.image.name) if node and node.image else ""
            if key in tiles:
                slot_tile[i] = tiles[key]
        for poly in mesh.polygons:
            tile = slot_tile.get(poly.material_index)
            if tile is None:
                continue
            ox, oy, sx, sy = tile
            loops = list(poly.loop_indices)
            # Ytor som ligger förskjutna en hel textur (t.ex. u = 1.2–1.8) flyttas tillbaka till 0–1 först.
            cu = math.floor(sum(uv[li].uv[0] for li in loops) / len(loops))
            cv = math.floor(sum(uv[li].uv[1] for li in loops) / len(loops))
            for li in loops:
                u, v = uv[li].uv
                u, v = u - cu, v - cv
                if u < -0.01 or u > 1.01 or v < -0.01 or v > 1.01:
                    outside.add(obj.material_slots[poly.material_index].material.name)
                uv[li].uv = (ox + min(max(u, 0.0), 1.0) * sx, oy + min(max(v, 0.0), 1.0) * sy)
                moved += 1
        # 3. Alla sammanslagna ytor använder huvudmaterialet.
        for poly in mesh.polygons:
            if poly.material_index in slot_tile:
                poly.material_index = 0
        if obj.material_slots:
            obj.material_slots[0].material = target
        used = {p.material_index for p in mesh.polygons}
        for i in range(len(mesh.materials) - 1, 0, -1):
            if i not in used:
                mesh.materials.pop(index=i)

    # 4. Diffuse-texturen heter som atlasen och ligger i .ytd:n (inte inbäddad).
    dnode = diffuse_node(target)
    dnode.image.name = spec["atlas"]
    dnode.image.filepath_raw = "//" + spec["atlas"] + ".dds"
    if hasattr(dnode, "texture_properties"):
        dnode.texture_properties.embedded = False
    for key, m in mats.items():
        if m != target and m.users == 0:
            bpy.data.materials.remove(m)

    res = bpy.ops.sollumz.export_assets(directory=out_dir + os.sep, direct_export=True, limit_to_selected=False, **PED_EXPORT)
    out = [f for f in os.listdir(out_dir) if f.lower().endswith(".ydd")]
    if "FINISHED" not in res or not out:
        raise RuntimeError("Sollumz kunde inte spara den nya .ydd:n.")
    print("ALEX_INFO " + json.dumps({"moved": moved, "tiling": sorted(outside), "primary": primary}), flush=True)
    ok(os.path.join(out_dir, out[0]))


def cmd_materials(ydd):
    """Listar diffuse-texturerna som modellen använder."""
    import json
    clear_scene()
    import_files([ydd])
    names = []
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for s in obj.material_slots:
            n = diffuse_node(s.material)
            if n and n.image:
                k = tex_key(n.image.name)
                if k not in names:
                    names.append(k)
    ok(json.dumps(names))


def cmd_edit(ydd, out_dir):
    enable_sollumz()
    clear_scene()
    import_files([ydd])

    class ALEX_OT_send(bpy.types.Operator):
        bl_idname = "alex.send_back"
        bl_label = "Skicka till alex_clothes"
        bl_description = "Exporterar modellen med Sollumz och laddar in den i alex_clothes"

        def execute(self, context):
            os.makedirs(out_dir, exist_ok=True)
            res = bpy.ops.sollumz.export_assets(directory=out_dir + os.sep, direct_export=True, limit_to_selected=False, **PED_EXPORT)
            if "FINISHED" in res:
                open(os.path.join(out_dir, ".done"), "w").close()
                self.report({"INFO"}, "Skickat till alex_clothes")
            else:
                self.report({"ERROR"}, "Exporten misslyckades – se Info-loggen")
            return {"FINISHED"}

    class ALEX_PT_panel(bpy.types.Panel):
        bl_label = "alex_clothes"
        bl_space_type = "VIEW_3D"
        bl_region_type = "UI"
        bl_category = "alex_clothes"

        def draw(self, context):
            col = self.layout.column()
            col.label(text="Fixa plagget och klicka sen:")
            col.operator("alex.send_back", icon="EXPORT")

    bpy.utils.register_class(ALEX_OT_send)
    bpy.utils.register_class(ALEX_PT_panel)
    ok("edit")


def main():
    try:
        if not ARGS:
            raise RuntimeError("Inget kommando")
        mode = ARGS[0]
        if mode == "check":
            enable_sollumz()
            from szio.gta5 import AssetFormat, is_provider_available
            ok("native" if is_provider_available(AssetFormat.NATIVE) else "xml")
        elif mode == "convert":
            enable_sollumz()
            cmd_convert(ARGS[1], ARGS[2:])
        elif mode == "ytd":
            enable_sollumz()
            cmd_ytd(ARGS[1], ARGS[2], ARGS[3:])
        elif mode == "batch":
            enable_sollumz()
            cmd_batch(ARGS[1])
        elif mode == "merge":
            enable_sollumz()
            cmd_merge(ARGS[1], ARGS[2], ARGS[3])
        elif mode == "materials":
            enable_sollumz()
            cmd_materials(ARGS[1])
        elif mode == "edit":
            cmd_edit(ARGS[1], ARGS[2])
        else:
            raise RuntimeError(f"Okänt kommando {mode}")
    except Exception as e:
        traceback.print_exc()
        err(str(e))
        if bpy.app.background:
            sys.exit(1)


main()
