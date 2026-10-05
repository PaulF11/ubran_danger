import 'package:latlong2/latlong.dart';

class RoutePlan {
  const RoutePlan({
    required this.distanceMeters,
    required this.durationSeconds,
    required this.points,
    required this.intelligence,
  });

  final double distanceMeters;
  final double durationSeconds;
  final List<LatLng> points;
  final RouteIntelligence intelligence;

  factory RoutePlan.fromJson(Map<String, dynamic> json) {
    final rawCoordinates = json['coordinates'];
    if (rawCoordinates is! List || rawCoordinates.length < 2) {
      throw const FormatException('Invalid route geometry.');
    }
    final points = rawCoordinates
        .map((coordinate) {
          if (coordinate is! List || coordinate.length < 2) {
            throw const FormatException('Invalid route coordinate.');
          }
          final longitude = (coordinate[0] as num).toDouble();
          final latitude = (coordinate[1] as num).toDouble();
          if (!latitude.isFinite ||
              !longitude.isFinite ||
              latitude < -90 ||
              latitude > 90 ||
              longitude < -180 ||
              longitude > 180) {
            throw const FormatException('Invalid route coordinate.');
          }
          return LatLng(latitude, longitude);
        })
        .toList(growable: false);
    final distanceMeters = (json['distanceMeters'] as num).toDouble();
    final durationSeconds = (json['durationSeconds'] as num).toDouble();
    final rawIntelligence = json['routeIntelligence'];
    if (!distanceMeters.isFinite ||
        distanceMeters < 0 ||
        !durationSeconds.isFinite ||
        durationSeconds < 0 ||
        rawIntelligence is! Map<String, dynamic>) {
      throw const FormatException('Invalid route analysis.');
    }

    return RoutePlan(
      distanceMeters: distanceMeters,
      durationSeconds: durationSeconds,
      points: points,
      intelligence: RouteIntelligence.fromJson(rawIntelligence),
    );
  }
}

class RouteIntelligence {
  const RouteIntelligence({
    required this.category,
    required this.message,
    required this.nearbyVerifiedIncidentCount,
    required this.severityCounts,
    required this.incidents,
    required this.usableVerifiedIncidentCount,
    required this.proximityThresholdMeters,
    required this.datasetLimited,
    required this.basis,
  });

  final String category;
  final String message;
  final int? nearbyVerifiedIncidentCount;
  final Map<String, int>? severityCounts;
  final List<RouteSafetyIncident> incidents;
  final int? usableVerifiedIncidentCount;
  final double? proximityThresholdMeters;
  final bool datasetLimited;
  final String basis;

  factory RouteIntelligence.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    final message = json['message'];
    final basis = json['basis'];
    final datasetLimited = json['datasetLimited'];
    final rawIncidents = json['incidents'];
    final rawSeverityCounts = json['severityCounts'];
    if (category is! String ||
        message is! String ||
        basis is! String ||
        datasetLimited is! bool ||
        rawIncidents is! List) {
      throw const FormatException('Invalid route intelligence.');
    }

    Map<String, int>? severityCounts;
    if (rawSeverityCounts != null) {
      if (rawSeverityCounts is! Map<String, dynamic>) {
        throw const FormatException('Invalid route severity counts.');
      }
      severityCounts = {
        for (final severity in const ['HIGH', 'MEDIUM', 'LOW'])
          severity: _requiredInt(rawSeverityCounts[severity]),
      };
    }

    return RouteIntelligence(
      category: category,
      message: message,
      nearbyVerifiedIncidentCount: _nullableInt(
        json['nearbyVerifiedIncidentCount'],
      ),
      severityCounts: severityCounts,
      incidents: rawIncidents
          .map((incident) {
            if (incident is! Map<String, dynamic>) {
              throw const FormatException('Invalid route incident.');
            }
            return RouteSafetyIncident.fromJson(incident);
          })
          .toList(growable: false),
      usableVerifiedIncidentCount: _nullableInt(
        json['usableVerifiedIncidentCount'],
      ),
      proximityThresholdMeters: _nullableDouble(
        json['proximityThresholdMeters'],
      ),
      datasetLimited: datasetLimited,
      basis: basis,
    );
  }
}

class RouteSafetyIncident {
  const RouteSafetyIncident({
    required this.id,
    required this.category,
    required this.severity,
    required this.barangay,
    required this.locationDescription,
    required this.incidentDate,
    required this.distanceMeters,
  });

  final String id;
  final String category;
  final String severity;
  final String? barangay;
  final String? locationDescription;
  final String? incidentDate;
  final double distanceMeters;

  factory RouteSafetyIncident.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final category = json['category'];
    final severity = json['severity'];
    final distanceMeters = _nullableDouble(json['distanceMeters']);
    if ((id is! num && id is! String) ||
        category is! String ||
        severity is! String ||
        distanceMeters == null) {
      throw const FormatException('Invalid route incident.');
    }
    return RouteSafetyIncident(
      id: id.toString(),
      category: category,
      severity: severity,
      barangay: json['barangay'] as String?,
      locationDescription: json['locationDescription'] as String?,
      incidentDate: json['incidentDate'] as String?,
      distanceMeters: distanceMeters,
    );
  }
}

int _requiredInt(dynamic value) {
  final number = _nullableInt(value);
  if (number == null) throw const FormatException('Invalid incident count.');
  return number;
}

int? _nullableInt(dynamic value) {
  if (value == null) return null;
  if (value is! num || !value.isFinite || value < 0 || value != value.round()) {
    throw const FormatException('Invalid incident count.');
  }
  return value.toInt();
}

double? _nullableDouble(dynamic value) {
  if (value == null) return null;
  if (value is! num || !value.isFinite || value < 0) {
    throw const FormatException('Invalid route distance.');
  }
  return value.toDouble();
}
