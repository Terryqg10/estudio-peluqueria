# rules/process.md — Cómo trabajar sin adelantarse

## Reglas

1. **Si una instrucción es ambigua, pregunta antes de implementar.**
   "Regístralo al hacer T-016" puede significar "haz T-016" o "cuando
   llegue T-016". Si dudas, pregunta. No interpretes.

2. **No hagas más de lo pedido.** Si ves algo que conviene arreglar
   pero no se te ha pedido, anótalo como tarea pendiente nueva
   (`sdd/tasks/`). No lo hagas por tu cuenta.

3. **Antes de cada commit, comprueba que has hecho exactamente lo
   pedido.** Si te has desviado en algo, dilo explícitamente. No
   commitees una desviación silenciosa.

4. **Antes de dar una decisión por pendiente, busca si ya está
   registrada.** Puede estar en un ADR, en una enmienda a una spec, en
   el plan, o en una review anterior. No dupliques.

## Excepción

Corregir un defecto que impide cumplir el CA de la tarea en curso **va
dentro de esa tarea**, no en una nueva. Se dice en la review: "corregido
un defecto colateral que impedía cumplir CA-xx".

## Relación con el resto de reglas

- `spec-first.md` — el flujo SDD.
- `ui-decisions.md` — decisiones de UI que se apartan de la convención.
- `quality-gates.md` — puertas de cierre.

`process.md` no sustituye a las demás: las coordina.
