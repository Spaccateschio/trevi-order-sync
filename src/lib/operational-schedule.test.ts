import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { describeOperationalSchedule, formatScheduleDays, type OperationalScheduleRow } from './operational-schedule';

const base: OperationalScheduleRow = {
  schedule_type: 'shopping_list',
  enabled: true,
  reminder_time: '09:30',
  monday: true, tuesday: true, wednesday: false, thursday: false,
  friday: false, saturday: true, sunday: false,
};

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
