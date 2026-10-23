import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReadOnlyScope } from '@/components/admin/read-only-scope';

// T-028: en solo lectura los controles quedan desactivados por el propio navegador y se explica por qué.
describe('ReadOnlyScope', () => {
  it('con readOnly desactiva todo lo de dentro (fieldset) y lo explica con texto', () => {
    render(
      <ReadOnlyScope readOnly>
        <form>
          <input aria-label="Nombre" />
          <button type="submit">Guardar</button>
        </form>
      </ReadOnlyScope>,
    );
    expect(screen.getByText('Desactivado en la demo: solo se puede mirar.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('sin readOnly no añade nada: los controles siguen activos', () => {
    render(
      <ReadOnlyScope readOnly={false}>
        <form>
          <input aria-label="Nombre" />
          <button type="submit">Guardar</button>
        </form>
      </ReadOnlyScope>,
    );
    expect(screen.queryByText(/Desactivado en la demo/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });
});
