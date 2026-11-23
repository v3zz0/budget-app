'use strict';

const fuso = 'Europe/Rome';
const orarioValido = /^([01]\d|2[0-3]):[0-5]\d$/;
const giornoValido = /^\d{4}-\d{2}-\d{2}$/;
const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function oraLocale(now) {
  const parti = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  return { data: `${parti.year}-${parti.month}-${parti.day}`, orario: `${parti.hour}:${parti.minute}` };
}

function aggiungiGiorni(iso, giorni) {
  const data = new Date(iso + 'T00:00:00Z');
  data.setUTCDate(data.getUTCDate() + giorni);
  return data.toISOString().slice(0, 10);
}

function meseDi(data) {
  const mese = data.slice(0, 7);
  const inizio = mese + '-01';
  const ultimo = new Date(inizio + 'T00:00:00Z');
  ultimo.setUTCMonth(ultimo.getUTCMonth() + 1, 0);
  return { mese, inizio, fine: ultimo.toISOString().slice(0, 10) };
}

function scadeIl(template, candidato) {
  const riferimento = template.RicorrenzaTemporale || template.Data;
  if (!giornoValido.test(riferimento) || (template.Data && candidato < template.Data)) return false;
  const { fine } = meseDi(candidato);
  return Number(candidato.slice(8)) === Math.min(Number(riferimento.slice(8)), Number(fine.slice(8)));
}

function preferenze(utente) {
  const orario = (utente.orarioNotificheWeb || utente.orarioNotifiche)?.slice(0, 5);
  return {
    orario: orarioValido.test(orario) ? orario : '08:00',
    scadenze: [0, 1].includes(utente.anticipoNotifiche) ? utente.anticipoNotifiche : null,
    budget: utente.avvisiBudget === true,
  };
}

function valide(value) {
  return !!value && typeof value.orario === 'string' && orarioValido.test(value.orario) &&
    [null, 0, 1].includes(value.scadenze) && typeof value.budget === 'boolean';
}

module.exports = { fuso, oraLocale, aggiungiGiorni, meseDi, scadeIl, preferenze, valide };
