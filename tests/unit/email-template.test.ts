import { describe, expect, it } from 'vitest';
import { escapeHtml, renderBookingConfirmation } from '@/lib/email/templates/booking-confirmation';

const TOKEN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12'; // 43 caracteres
const base = {
  salonName: 'Atelier Malva',
  guestName: 'Ana García',
  serviceName: 'Tratamiento hidratante',
  stylistName: 'Irene Solís',
  startsAt: '2026-11-02T09:30:00.000Z', // 10:30 en Madrid
  link: `http://localhost:3000/cita/${TOKEN}`,
};

describe('escapeHtml', () => {
  it('escapa los caracteres con significado en HTML', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });
});

describe('renderBookingConfirmation', () => {
  it('el asunto lleva salón, día y hora locales, y NUNCA el enlace ni el token', () => {
    const { subject } = renderBookingConfirmation(base);
    expect(subject).toBe('Tu cita en Atelier Malva: Lunes, 2 de noviembre a las 10:30');
    expect(subject).not.toContain(TOKEN);
    expect(subject).not.toContain('/cita/');
  });

  it('el texto y el HTML incluyen servicio, estilista, día, hora y el enlace personal', () => {
    const { text, html } = renderBookingConfirmation(base);
    for (const body of [text, html]) {
      expect(body).toContain('Tratamiento hidratante');
      expect(body).toContain('Irene Solís');
      expect(body).toContain('10:30');
      expect(body).toContain(base.link);
    }
    expect(text).toContain('No lo compartas');
    expect(html).toContain(`<a href="${base.link}">Ver mi cita</a>`);
  });

  it('el HTML escapa lo que escribe la persona: un nombre malicioso no inyecta marcado', () => {
    const { html, text } = renderBookingConfirmation({
      ...base,
      guestName: '<img src=x onerror=alert(1)> "Ana"',
      serviceName: '<b>Corte</b>',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>Corte</b>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &quot;Ana&quot;');
    // El texto plano no es HTML: va tal cual.
    expect(text).toContain('<img src=x onerror=alert(1)> "Ana"');
  });

  it('no incluye datos personales distintos del nombre de quien lo recibe', () => {
    const { subject, text, html } = renderBookingConfirmation(base);
    for (const part of [subject, text, html]) {
      expect(part).not.toMatch(/@|\+34|600/);
    }
  });
});
