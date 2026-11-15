const INCIDENT_EXPIRATION_MONTHS = 12;

const INCIDENT_EXPIRATION_DATE_SQL =
  "DATE_ADD(DATE(incidents.incident_date), INTERVAL 12 MONTH)";
const MANILA_TODAY_SQL =
  "DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)";

function isIncidentExpirationEnabled(environment = process.env) {
  return (
    environment.INCIDENT_EXPIRATION_ENABLED === "true" &&
    environment.ENABLE_INCIDENT_PERMANENT_EXPIRATION === "true"
  );
}

function activeIncidentDateSql(environment = process.env) {
  return isIncidentExpirationEnabled(environment)
    ? `${INCIDENT_EXPIRATION_DATE_SQL} > ${MANILA_TODAY_SQL}`
    : "1 = 1";
}

const ACTIVE_INCIDENT_DATE_SQL = activeIncidentDateSql();

const INCIDENT_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/i;

function isValidCalendarDate(year, month, day) {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

function daysInMonth(year, month) {
  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function manilaDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError("A valid current date is required.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const fields = Object.fromEntries(
    parts
      .filter(({ type }) => ["year", "month", "day"].includes(type))
      .map(({ type, value: part }) => [type, part]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function incidentDateOnly(value) {
  if (typeof value !== "string") return null;
  const match = INCIDENT_DATE_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isValidCalendarDate(year, month, day)) return null;

  if (hourText !== undefined) {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText || 0);
    if (hour > 23 || minute > 59 || second > 59) return null;
    if (zone && zone.toUpperCase() !== "Z") {
      const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(zone);
      if (
        !offsetMatch ||
        Number(offsetMatch[2]) > 14 ||
        Number(offsetMatch[3]) > 59 ||
        (Number(offsetMatch[2]) === 14 && Number(offsetMatch[3]) !== 0)
      ) {
        return null;
      }
    }
  }

  if (!zone) return `${yearText}-${monthText}-${dayText}`;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return manilaDate(new Date(timestamp));
}

function expirationDate(incidentDate) {
  const occurrenceDate = incidentDateOnly(incidentDate);
  if (!occurrenceDate) return null;

  const [year, month, day] = occurrenceDate.split("-").map(Number);
  const expiryYear = year + Math.floor((month - 1 + INCIDENT_EXPIRATION_MONTHS) / 12);
  const expiryMonth = ((month - 1 + INCIDENT_EXPIRATION_MONTHS) % 12) + 1;
  const expiryDay = Math.min(day, daysInMonth(expiryYear, expiryMonth));
  return `${String(expiryYear).padStart(4, "0")}-${String(expiryMonth).padStart(2, "0")}-${String(expiryDay).padStart(2, "0")}`;
}

function isIncidentExpired(incidentDate, now = new Date()) {
  const expiresOn = expirationDate(incidentDate);
  return expiresOn !== null && expiresOn <= manilaDate(now);
}

module.exports = {
  ACTIVE_INCIDENT_DATE_SQL,
  INCIDENT_EXPIRATION_DATE_SQL,
  INCIDENT_EXPIRATION_MONTHS,
  activeIncidentDateSql,
  expirationDate,
  incidentDateOnly,
  isIncidentExpirationEnabled,
  isIncidentExpired,
  manilaDate,
};
