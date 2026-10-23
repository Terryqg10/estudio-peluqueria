-- T-026 (ADR-0036): rol `demo`, cuenta de solo lectura del panel para la demo de portfolio.
-- Va en su propia migración: un valor nuevo de un enum no se puede usar en la misma transacción que lo crea.

alter type public.user_role add value if not exists 'demo';
