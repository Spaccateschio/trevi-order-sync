import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { describeOperationalSchedule, effectiveReminderTime, formatScheduleDays, hasTodayOverride, type OperationalScheduleRow } from './operational-schedule';

const base: OperationalScheduleRow = {
  schedule_type: 'shopping_list',
  enabled: true,
  reminder_time: '09:30',
  override_date: null,
  override_time: null,
  monday: true, tuesday: true, wednesday: false, thursday: false,
  friday: false, saturday: true, sunday: false,
};

const TODAY = '2026-10-08';

describe('Riassunto preparazione Lista della Spesa', () => {
  it('elenca i giorni selezionati in ordine settimanale', () => assert.equal(formatScheduleDays(base), 'Lun · Mar · Sab'));
  it('mostra giorni e orario quando il promemoria è attivo', () => assert.equal(describeOperationalSchedule(base), 'Lun · Mar · Sab · 09:30'));
  it('taglia i secondi dell orario salvato', () => assert.equal(describeOperationalSchedule({ ...base, reminder_time: '09:30:45' }), 'Lun · Mar · Sab · 09:30'));
  it('dice «disattivato» quando enabled è spento, anche con giorni e orario salvati', () => assert.equal(describeOperationalSchedule({ ...base, enabled: false }), 'Promemoria disattivato'));
  it('dice «non impostato» se l azienda non ha nessuna riga', () => assert.equal(describeOperationalSchedule(null), 'Promemoria non impostato'));
  it('non inventa l orario quando manca', () => assert.equal(describeOperationalSchedule({ ...base, reminder_time: null }), 'Lun · Mar · Sab'));
  it('non inventa i giorni quando nessuno è selezionato', () => assert.equal(describeOperationalSchedule({ ...base, monday: false, tuesday: false, saturday: false }), '09:30'));
  it('dice che nulla è stato impostato se giorni e orario sono vuoti', () => assert.equal(
    describeOperationalSchedule({ ...base, monday: false, tuesday: false, saturday: false, reminder_time: null }),
    'Giorni e orario non impostati',
  ));
});

describe('Eccezione «solo oggi»', () => {
  const withOverride = { ...base, override_date: TODAY, override_time: '10:30' };
  it('oggi vale l orario eccezionale', () => assert.equal(effectiveReminderTime(withOverride, TODAY), '10:30'));
  it('il riassunto di oggi mostra l eccezione e la marca «solo oggi»', () =>
    assert.equal(describeOperationalSchedule(withOverride, TODAY), 'Lun · Mar · Sab · 10:30 (solo oggi)'));
  it('segnala che oggi c è un eccezione attiva', () => assert.equal(hasTodayOverride(withOverride, TODAY), true));
  it('domani torna da sola all orario standard', () => {
    assert.equal(effectiveReminderTime(withOverride, '2026-10-09'), '09:30');
    assert.equal(hasTodayOverride(withOverride, '2026-10-09'), false);
    assert.equal(describeOperationalSchedule(withOverride, '2026-10-09'), 'Lun · Mar · Sab · 09:30');
  });
  it('un eccezione di ieri è già scaduta', () =>
    assert.equal(effectiveReminderTime({ ...base, override_date: '2026-10-07', override_time: '10:30' }, TODAY), '09:30'));
  it('senza eccezione vale sempre l orario standard', () => {
    assert.equal(effectiveReminderTime(base, TODAY), '09:30');
    assert.equal(hasTodayOverride(base, TODAY), false);
  });
  it('l eccezione non modifica mai l orario standard salvato', () => assert.equal(withOverride.reminder_time, '09:30'));
});
