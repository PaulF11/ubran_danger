class Incident {
  const Incident({
    required this.id,
    required this.categoryName,
    required this.categoryDescription,
    required this.city,
    required this.barangay,
    required this.latitude,
    required this.longitude,
    required this.locationDescription,
    required this.locationSourceName,
    required this.locationSourceUrl,
    required this.description,
    required this.severity,
    required this.incidentDate,
    required this.incidentTimeKnown,
    required this.source,
    required this.sourceName,
    required this.sourceUrl,
    required this.sourcePublishedAt,
    required this.verificationStatus,
    required this.verificationMethod,
    required this.lastVerifiedAt,
  });

  final int id;
  final String categoryName;
  final String categoryDescription;
  final String city;
  final String? barangay;
  final double? latitude;
  final double? longitude;
  final String? locationDescription;
  final String? locationSourceName;
  final String? locationSourceUrl;
  final String description;
  final String severity;
  final DateTime incidentDate;
  final bool incidentTimeKnown;
  final String source;
  final String sourceName;
  final String? sourceUrl;
  final String? sourcePublishedAt;
  final String verificationStatus;
  final String? verificationMethod;
  final DateTime? lastVerifiedAt;

  factory Incident.fromJson(Map<String, dynamic> json) {
    final source = json['source'] as String? ?? '';
    final latitude = json['latitude'];
    final longitude = json['longitude'];
    final incidentTimeKnown =
      json['incident_time_known'] == true ||
      json['incident_time_known'] == 1;
    final incidentDateValue = json['incident_date'] as String;
    return Incident(
      id: (json['id'] as num).toInt(),
      categoryName: json['category_name'] as String,
      categoryDescription: json['category_description'] as String,
      city: json['city'] as String? ?? 'Taguig City',
      barangay: json['barangay'] as String?,
      latitude: latitude == null ? null : double.parse(latitude.toString()),
      longitude: longitude == null ? null : double.parse(longitude.toString()),
      locationDescription: json['location_description'] as String?,
      locationSourceName: json['location_source_name'] as String?,
      locationSourceUrl: json['location_source_url'] as String?,
      description: json['description'] as String,
      severity: json['severity'] as String,
        incidentDate: incidentTimeKnown
          ? DateTime.parse(incidentDateValue)
          : DateTime.parse('${incidentDateValue.substring(0, 10)}T12:00:00'),
        incidentTimeKnown: incidentTimeKnown,
      source: source,
      sourceName: json['source_name'] as String? ?? source,
      sourceUrl: json['source_url'] as String?,
      sourcePublishedAt: json['source_published_at'] as String?,
      verificationStatus: json['verification_status'] as String,
      verificationMethod: json['verification_method'] as String?,
      lastVerifiedAt: json['last_verified_at'] == null
          ? null
          : DateTime.parse(json['last_verified_at'] as String),
    );
  }
}
