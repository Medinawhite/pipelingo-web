"""Valida los archivos de pruebas en content/ según el formato acordado."""
import json
import re
import sys
from pathlib import Path

TYPES = {"multiple_choice", "true_false", "match", "fill_command", "find_error", "order_steps"}
COMMON = {"id", "type", "prompt", "explanation", "tags", "difficulty"}
ID_RE = re.compile(r"^[a-z0-9-]+\.[a-z0-9-]+\.p[1-5]\.q\d{2}$")
MAX_EXPL, MAX_WHY = 200, 120


def check_question(q, header, errors, seen):
    qid = q.get("id", "?")
    err = lambda m: errors.append(f"{qid}: {m}")
    missing = COMMON - q.keys()
    if missing:
        err(f"faltan campos {sorted(missing)}")
    if not ID_RE.match(qid):
        err("id no sigue el patrón unidad.leccion.prueba.numero")
    else:
        unit, lesson, p, _ = qid.split(".")
        if unit != header["unit"] or lesson != header["lesson"] or p != f"p{header['test']}":
            err("id no coincide con la cabecera del archivo")
    if qid in seen:
        err("id duplicado")
    seen.add(qid)
    if q.get("type") not in TYPES:
        err(f"tipo desconocido {q.get('type')}")
    if len(q.get("explanation", "")) > MAX_EXPL:
        err(f"explanation tiene {len(q['explanation'])} caracteres (máx {MAX_EXPL})")
    if q.get("difficulty") not in (1, 2, 3):
        err("difficulty debe ser 1, 2 o 3")
    if not q.get("tags"):
        err("tags vacío")

    t = q.get("type")
    if t == "multiple_choice":
        opts = q.get("options", [])
        ids = [o["id"] for o in opts]
        if not 3 <= len(opts) <= 4:
            err("multiple_choice necesita 3-4 opciones")
        if q.get("answer") not in ids:
            err("answer no apunta a una opción")
        for o in opts:
            if len(o.get("why", "")) > MAX_WHY:
                err(f"why de {o['id']} supera {MAX_WHY} caracteres")
            if o["id"] == q.get("answer") and "why" in o:
                err("la opción correcta no lleva why")
    elif t == "true_false":
        if not isinstance(q.get("answer"), bool):
            err("answer debe ser true o false")
    elif t == "match":
        if not 3 <= len(q.get("pairs", [])) <= 5:
            err("match necesita 3-5 parejas")
    elif t == "fill_command":
        holes = set(re.findall(r"\{\{(\w+)\}\}", q.get("template", "")))
        if not holes or holes != set(q.get("blanks", {})):
            err("los huecos del template no coinciden con blanks")
    elif t == "find_error":
        n = len(q.get("code", {}).get("content", "").split("\n"))
        if not q.get("answer") or any(not 1 <= a <= n for a in q["answer"]):
            err("answer apunta a una línea que no existe")
        if not q.get("fix"):
            err("falta fix")
    elif t == "order_steps":
        ids = {s["id"] for s in q.get("steps", [])}
        if not 4 <= len(ids) <= 6:
            err("order_steps necesita 4-6 pasos")
        for order in [q.get("answer", [])] + q.get("acceptAlso", []):
            if sorted(order) != sorted(ids):
                err("un orden no usa exactamente todos los pasos")


LAB_KINDS = {"terminal", "editor"}
TERMINAL_CHECKS = {"image_exists", "image_absent", "container", "command_ran", "http_ok"}
EDITOR_CHECKS = {"yaml_valid", "yaml_path", "regex", "not_regex", "order", "run"}
# Event ids of the web workflow simulator (src/sim/workflow.ts, EVENTS).
LAB_EVENTS = {"push-main", "push-feature", "pr-main", "tag", "docs", "dispatch"}
LAB_RUN_EXPECT = {"success", "not_triggered", "job_skipped"}


def check_lab(path, lab, errors):
    """Labs (web only): format checks. web/src/content/content.test.ts also solves each one."""
    err = lambda m: errors.append(f"{path}: {m}")
    for field in ("level", "unit", "lesson", "lab", "kind", "title", "intro", "outro", "objectives"):
        if field not in lab:
            err(f"falta {field}")
    if path.name != f"lab-{lab.get('lab')}.json":
        err("el número de lab no coincide con el nombre del archivo")
    kind = lab.get("kind")
    if kind not in LAB_KINDS:
        err(f"kind desconocido {kind}")
    if kind == "editor":
        f = lab.get("file", {})
        if not f.get("path") or not f.get("starter") or f.get("lang") not in ("yaml", "dockerfile"):
            err("file necesita path, lang (yaml o dockerfile) y starter")
        if not lab.get("solution"):
            err("falta solution")
    allowed = TERMINAL_CHECKS if kind == "terminal" else EDITOR_CHECKS
    objectives = lab.get("objectives", [])
    if not 3 <= len(objectives) <= 8:
        err("un lab necesita 3-8 objetivos")
    ids = [o.get("id") for o in objectives]
    if len(set(ids)) != len(ids):
        err("ids de objetivos repetidos")
    for o in objectives:
        if not o.get("text") or not o.get("hint"):
            err(f"{o.get('id')}: falta text o hint")
        check = o.get("check", {})
        if check.get("type") not in allowed:
            err(f"{o.get('id')}: check {check.get('type')} no vale en un lab {kind}")
        if check.get("type") == "run":
            if check.get("event") not in LAB_EVENTS:
                err(f"{o.get('id')}: evento desconocido {check.get('event')}")
            if check.get("expect") not in LAB_RUN_EXPECT:
                err(f"{o.get('id')}: expect desconocido {check.get('expect')}")
            if check.get("expect") == "job_skipped" and not check.get("job"):
                err(f"{o.get('id')}: job_skipped necesita job")
        for key in ("pattern", "matches", "first", "then"):
            if key in check:
                try:
                    re.compile(check[key])
                except re.error as e:
                    err(f"{o.get('id')}: regex {key} no válida: {e}")


def main(root):
    errors, seen, total = [], set(), 0
    labs = sorted(Path(root).rglob("lab-*.json"))
    for path in labs:
        check_lab(path, json.loads(path.read_text(encoding="utf-8")), errors)
    print(f"Labs: {len(labs)}")
    for path in sorted(Path(root).rglob("prueba-*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        qs = data.get("questions", [])
        total += len(qs)
        if not 12 <= len(qs) <= 15:
            errors.append(f"{path}: tiene {len(qs)} preguntas (deben ser 12-15)")
        types = {}
        for q in qs:
            check_question(q, data, errors, seen)
            types[q.get("type")] = types.get(q.get("type"), 0) + 1
        print(f"{path.name}: {len(qs)} preguntas {types}")
    print(f"Total: {total} preguntas")
    if errors:
        print("\nERRORES:")
        print("\n".join(errors))
        sys.exit(1)
    print("OK: sin errores")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "content")
