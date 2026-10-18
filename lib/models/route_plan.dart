import 'package:latlong2/latlong.dart';

class RoutePlan {
  const RoutePlan({
    required this.distanceMeters,
    required this.durationSeconds,
    required this.points,
    required this.intelligence,
    this.isRecommended = false,
    this.recommendationReason,
  });

  final double distanceMeters;
  final double durationSeconds;
  final List<LatLng> points;
  final RouteIntelligence intelligence;
  final bool isRecommended;
  final String? recommendationReason;

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
    final isRecommended = json['isRecommended'];
    final recommendationReason = json['recommendationReason'];
    if (!distanceMeters.isFinite ||
        distanceMeters < 0 ||
        !durationSeconds.isFinite ||
        durationSeconds < 0 ||
        rawIntelligence is! Map<String, dynamic> ||
        (isRecommended != null && isRecommended is! bool) ||
        (recommendationReason != null && recommendationReason is! String)) {
      throw const FormatException('Invalid route analysis.');
    }

    return RoutePlan(
      distanceMeters: distanceMeters,
      durationSeconds: durationSeconds,
      points: points,
      intelligence: RouteIntelligence.fromJson(rawIntelligence),
      isRecommended: isRecommended as bool? ?? false,
      recommendationReason: recommendationReason as String?,
    );
  }
}

class RouteAnalysis {
  const RouteAnalysis({
    required this.routes,
    required this.recommendedRouteIndex,
    required this.recommendationReason,
    required this.methodology,
  });

  final List<RoutePlan> routes;
  final int? recommendedRouteIndex;
  final String recommendationReason;
  final String methodology;

  factory RouteAnalysis.fromJson(Map<String, dynamic> json) {
    final primary = RoutePlan.fromJson(json);
    final rawAlternatives = json['alternatives'];
    final rawRecommendation = json['recommendation'];
    if (rawAlternatives != null && rawAlternatives is! List) {
      throw const FormatException('Invalid route alternatives.');
    }
    if (rawRecommendation != null &&
        rawRecommendation is! Map<String, dynamic>) {
      throw const FormatException('Invalid route recommendation.');
    }
    final alternatives = (rawAlternatives as List? ?? [])
        .map((route) {
          if (route is! Map<String, dynamic>) {
            throw const FormatException('Invalid alternative route.');
          }
          return RoutePlan.fromJson(route);
        })
        .toList(growable: false);
    final routes = [primary, ...alternatives];

    int? recommendedRouteIndex;
    var recommendationReason =
        'No alternative route is recommended by the available data.';
    var methodology = '';
    if (rawRecommendation case final Map<String, dynamic> recommendation) {
      final index = recommendation['recommendedRouteIndex'];
      if (index != null &&
          (index is! int || index < 0 || index >= routes.length)) {
        throw const FormatException('Invalid recommended route index.');
      }
      recommendedRouteIndex = index as int?;
      recommendationReason = recommendation['reason'] is String
          ? recommendation['reason'] as String
          : recommendationReason;
      methodology = recommendation['methodology'] is String
          ? recommendation['methodology'] as String
          : '';
    }
    return RouteAnalysis(
      routes: routes
          .asMap()
          .entries
          .map(
            (entry) => RoutePlan(
              distanceMeters: entry.value.distanceMeters,
              durationSeconds: entry.value.durationSeconds,
              points: entry.value.points,
              intelligence: entry.value.intelligence,
              isRecommended: entry.key == recommendedRouteIndex,
              recommendationReason: entry.key == recommendedRouteIndex
                  ? recommendationReason
                  : null,
            ),
          )
          .toList(growable: false),
      recommendedRouteIndex: recommendedRouteIndex,
      recommendationReason: recommendationReason,
      methodology: methodology,
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
    this.weightedExposureScore,
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
  final double? weightedExposureScore;

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
      weightedExposureScore: _nullableDouble(json['weightedExposureScore']),
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
    this.estimatedMinutesFromStart,
    this.sourceUrl,
    this.exposureWeight,
  });

  final String id;
  final String category;
  final String severity;
  final String? barangay;
  final String? locationDescription;
  final String? incidentDate;
  final double distanceMeters;
  final int? estimatedMinutesFromStart;
  final String? sourceUrl;
  final double? exposureWeight;

  factory RouteSafetyIncident.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final category = json['category'];
    final severity = json['severity'];
    final distanceMeters = _nullableDouble(json['distanceMeters']);
    final estimatedMinutesFromStart = _nullableInt(
      json['estimatedMinutesFromStart'],
    );
    if ((id is! num && id is! String) ||
        category is! String ||
        severity is! String ||
        distanceMeters == null ||
        (json['estimatedMinutesFromStart'] != null &&
            (estimatedMinutesFromStart == null ||
                estimatedMinutesFromStart < 0))) {
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
      estimatedMinutesFromStart: estimatedMinutesFromStart,
      sourceUrl: json['sourceUrl'] as String?,
      exposureWeight: _nullableDouble(json['exposureWeight']),
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
