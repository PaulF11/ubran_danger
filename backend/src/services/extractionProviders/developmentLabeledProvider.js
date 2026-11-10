// File note: This file handles developmentLabeledProvider.js.

const FIELD_LABELS = [
  "Category",
  "Barangay",
  "Severity",
  "Incident Date",
  "Coordinates",
  "Description",
];

exports.extract = (sourceText) => {
  const fields = new Map();
  const lines = sourceText.split(/\r?\n/);
  let currentField = null;

  for (const line of lines) {
    const match = /^\s*(Category|Barangay|Severity|Incident Date|Coordinates|Description)\s*:\s*(.*)$/i.exec(line);
    if (match) {
      currentField = FIELD_LABELS.find(
        (label) => label.toLowerCase() === match[1].toLowerCase(),
      );
      fields.set(currentField, match[2].trim());
    } else if (currentField === "Description" && line.trim()) {
      fields.set(currentField, `${fields.get(currentField)} ${line.trim()}`.trim());
    }
  }

  const coordinateMatch = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(
    fields.get("Coordinates") || "",
  );
  const incidentDate = new Date(fields.get("Incident Date") || "");

  if (
    !fields.get("Category") ||
    !fields.get("Barangay") ||
    !fields.get("Description") ||
    !coordinateMatch ||
    !Number.isFinite(incidentDate.getTime())
  ) {
    throw new Error(
      "The development extractor needs Category, Barangay, Severity, Incident Date, Coordinates, and Description fields.",
    );
  }

  return {
    categoryName: fields.get("Category"),
    barangay: fields.get("Barangay"),
    severity: (fields.get("Severity") || "").toUpperCase(),
    incidentDate: incidentDate.toISOString().slice(0, 19).replace("T", " "),
    latitude: Number(coordinateMatch[1]),
    longitude: Number(coordinateMatch[2]),
    description: fields.get("Description"),
  };
};
