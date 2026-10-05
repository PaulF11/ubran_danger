import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../models/incident.dart';
import '../../models/route_plan.dart';
import '../../core/taguig_region.dart';
import '../../services/incident_service.dart';
import '../../services/route_service.dart';
import '../incidents/incident_details_screen.dart';
import 'map_filter_sheet.dart';
import 'route_safety_summary.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({super.key});

  @override
  State<MapScreen> createState() => _MapScreenState();
}

enum _MapMode { incidents, route }

class _MapScreenState extends State<MapScreen> {
  final MapController _mapController = MapController();
  final IncidentService _incidentService = IncidentService();
  final RouteService _routeService = RouteService();
  final TextEditingController _searchController = TextEditingController();
  late final MapOptions _mapOptions = taguigMapOptions(
    onTap: (_, point) => _handleMapTap(point),
  );

  List<Incident> _incidents = [];
  MapFilters _filters = const MapFilters();
  String _query = '';
  String? _errorMessage;
  bool _isLoading = true;
  bool _showDensity = false;
  bool _tileError = false;
  int _tileRetry = 0;
  _MapMode _mode = _MapMode.incidents;
  LatLng? _routeStart;
  LatLng? _routeDestination;
  RoutePlan? _routePlan;
  bool _routeLoading = false;
  String? _routeError;

  List<String> get _categories =>
      _incidents.map((incident) => incident.categoryName).toSet().toList()
        ..sort();

  List<String> get _barangays =>
      _incidents
          .map((incident) => incident.barangay)
          .whereType<String>()
          .toSet()
          .toList()
        ..sort();

  List<Incident> get _mappableIncidents => _visibleIncidents
      .where((incident) {
        final latitude = incident.latitude;
        final longitude = incident.longitude;
        return latitude != null &&
            longitude != null &&
            latitude.isFinite &&
            longitude.isFinite &&
            isWithinTaguigMapArea(LatLng(latitude, longitude));
      })
      .toList(growable: false);

  List<Incident> get _visibleIncidents {
    final query = _query.trim().toLowerCase();
    return _incidents
        .where((incident) {
          final localDate = incident.incidentDate.toLocal();
          final matchesQuery =
              query.isEmpty ||
              incident.categoryName.toLowerCase().contains(query) ||
              (incident.barangay ?? '').toLowerCase().contains(query) ||
              incident.description.toLowerCase().contains(query);
          final matchesCategory =
              _filters.category == null ||
              incident.categoryName == _filters.category;
          final matchesSeverity =
              _filters.severity == null ||
              incident.severity == _filters.severity;
          final matchesBarangay =
              _filters.barangay == null ||
              incident.barangay == _filters.barangay;
          final dateRange = _filters.dateRange;
          final matchesDate =
              dateRange == null ||
              (!localDate.isBefore(
                    DateTime(
                      dateRange.start.year,
                      dateRange.start.month,
                      dateRange.start.day,
                    ),
                  ) &&
                  localDate.isBefore(
                    DateTime(
                      dateRange.end.year,
                      dateRange.end.month,
                      dateRange.end.day + 1,
                    ),
                  ));
          return matchesQuery &&
              matchesCategory &&
              matchesSeverity &&
              matchesBarangay &&
              matchesDate;
        })
        .toList(growable: false);
  }

  @override
  void initState() {
    super.initState();
    _loadIncidents();
  }

  Future<void> _loadIncidents() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final incidents = await _incidentService.fetchIncidents();
      if (!mounted) return;
      setState(() {
        _incidents = incidents;
        _isLoading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = error is IncidentApiException
            ? error.message
            : 'Unable to load Taguig incidents. Check your connection and retry.';
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _incidentService.close();
    _routeService.close();
    _mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        FlutterMap(
          mapController: _mapController,
          options: _mapOptions,
          children: [
            TileLayer(
              key: ValueKey(_tileRetry),
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.example.urban_danger',
              maxNativeZoom: 19,
              errorTileCallback: (_, _, _) {
                if (mounted && !_tileError) {
                  setState(() => _tileError = true);
                }
              },
            ),
            if (_showDensity && _mappableIncidents.length >= 3)
              CircleLayer(
                circles: _buildDensityCircles(),
                optimizeRadiusInMeters: true,
              ),
            if (_routePlan case final route?)
              PolylineLayer(
                polylines: [
                  Polyline(
                    points: route.points,
                    color: Theme.of(context).colorScheme.primary,
                    strokeWidth: 5,
                    borderColor: Colors.white,
                    borderStrokeWidth: 2,
                  ),
                ],
              ),
            MarkerLayer(markers: _buildMarkers(context)),
            const SimpleAttributionWidget(
              source: Text('OpenStreetMap contributors'),
              alignment: Alignment.bottomLeft,
              backgroundColor: Color(0xEFFFFFFF),
            ),
          ],
        ),
        _buildTopControls(context),
        if (_tileError) _buildTileError(context),
        if (!_isLoading && _errorMessage != null) _buildApiError(context),
        if (!_isLoading && _errorMessage == null && _visibleIncidents.isEmpty)
          _buildEmptyResults(context),
        if (_isLoading) _buildLoadingIndicator(context),
        if (_mode == _MapMode.route) _buildRouteControls(context),
        if (_mode == _MapMode.incidents && _showDensity)
          _buildDensityLegend(
            context,
            hasEnoughReports: _mappableIncidents.length >= 3,
          ),
      ],
    );
  }

  Widget _buildTopControls(BuildContext context) {
    final theme = Theme.of(context);
    final filterCount = [
      _filters.category,
      _filters.severity,
      _filters.barangay,
      _filters.dateRange,
    ].where((value) => value != null).length;
    return Positioned(
      top: 10,
      left: 10,
      right: 10,
      child: SafeArea(
        bottom: false,
        child: Material(
          elevation: 3,
          color: theme.colorScheme.surface.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
            child: Column(
              children: [
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _searchController,
                        onChanged: (value) => setState(() => _query = value),
                        textInputAction: TextInputAction.search,
                        decoration: InputDecoration(
                          hintText: 'Search Taguig incidents',
                          prefixIcon: const Icon(Icons.search),
                          border: InputBorder.none,
                          isDense: true,
                          suffixIcon: _query.isEmpty
                              ? null
                              : IconButton(
                                  tooltip: 'Clear search',
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() => _query = '');
                                  },
                                  icon: const Icon(Icons.close),
                                ),
                        ),
                      ),
                    ),
                    IconButton(
                      tooltip: filterCount == 0
                          ? 'Filter incidents'
                          : 'Filters active: $filterCount',
                      onPressed: _openFilters,
                      icon: Badge(
                        isLabelVisible: filterCount > 0,
                        label: Text('$filterCount'),
                        child: const Icon(Icons.tune),
                      ),
                    ),
                    IconButton(
                      tooltip: _showDensity
                          ? 'Hide incident density'
                          : 'Show incident density',
                      onPressed: () =>
                          setState(() => _showDensity = !_showDensity),
                      color: _showDensity ? theme.colorScheme.primary : null,
                      icon: const Icon(Icons.blur_on_outlined),
                    ),
                    IconButton(
                      tooltip: 'Return to Taguig view',
                      onPressed: () => _mapController.move(
                        taguigMapCenter,
                        taguigMapInitialZoom,
                      ),
                      icon: const Icon(Icons.my_location_outlined),
                    ),
                  ],
                ),
                const Divider(height: 1),
                Padding(
                  padding: const EdgeInsets.only(top: 5),
                  child: SegmentedButton<_MapMode>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(
                        value: _MapMode.incidents,
                        icon: Icon(Icons.place_outlined),
                        label: Text('Incidents'),
                      ),
                      ButtonSegment(
                        value: _MapMode.route,
                        icon: Icon(Icons.route_outlined),
                        label: Text('Route analysis'),
                      ),
                    ],
                    selected: {_mode},
                    onSelectionChanged: (selection) =>
                        _setMode(selection.first),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildLoadingIndicator(BuildContext context) => Positioned(
    top: 150,
    left: 20,
    right: 20,
    child: Center(
      child: Chip(
        avatar: const SizedBox.square(
          dimension: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        label: const Text('Loading verified incidents'),
        backgroundColor: Theme.of(context).colorScheme.surface,
      ),
    ),
  );

  Widget _buildTileError(BuildContext context) => Positioned(
    top: 158,
    left: 20,
    right: 20,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            const Icon(Icons.map_outlined),
            const SizedBox(width: 8),
            const Expanded(child: Text('Map tiles could not be loaded.')),
            TextButton(
              onPressed: () => setState(() {
                _tileError = false;
                _tileRetry++;
              }),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _buildApiError(BuildContext context) => Positioned(
    top: 210,
    left: 20,
    right: 20,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Text(_errorMessage!, textAlign: TextAlign.center),
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: _loadIncidents,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry incidents'),
            ),
          ],
        ),
      ),
    ),
  );

  Widget _buildEmptyResults(BuildContext context) => Positioned(
    left: 24,
    right: 24,
    top: MediaQuery.sizeOf(context).height * 0.46,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(
          _incidents.isEmpty
              ? 'No verified Taguig incidents are currently available.'
              : 'No incidents match these filters.',
          textAlign: TextAlign.center,
        ),
      ),
    ),
  );

  Widget _buildDensityLegend(
    BuildContext context, {
    required bool hasEnoughReports,
  }) => Positioned(
    bottom: 12,
    right: 10,
    child: SafeArea(
      top: false,
      child: Material(
        elevation: 2,
        color: Theme.of(context).colorScheme.surface.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          child: hasEnoughReports
              ? const Text('Reported incident concentration')
              : const Text('At least 3 reports needed for density view'),
        ),
      ),
    ),
  );

  Widget _buildRouteControls(BuildContext context) {
    final theme = Theme.of(context);
    final canAnalyze = _routeStart != null && _routeDestination != null;
    return Positioned(
      right: 12,
      bottom: 18,
      child: SafeArea(
        top: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (_routeError != null)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Text(
                    _routeError!,
                    style: TextStyle(color: theme.colorScheme.error),
                  ),
                ),
              ),
            if (_routeLoading)
              const Card(
                child: Padding(
                  padding: EdgeInsets.all(12),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      SizedBox(width: 10),
                      Text('Finding route'),
                    ],
                  ),
                ),
              )
            else if (canAnalyze)
              FilledButton.icon(
                onPressed: _analyzeRoute,
                icon: const Icon(Icons.alt_route),
                label: const Text('Analyze route'),
              )
            else
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Text(
                    _routeStart == null
                        ? 'Tap the map to set a start point.'
                        : 'Tap the map to set a destination.',
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  List<Marker> _buildMarkers(BuildContext context) {
    final markers = _mappableIncidents.map((incident) {
      final color = _severityColor(incident.severity);
      return Marker(
        key: ValueKey('incident-${incident.id}'),
        point: LatLng(incident.latitude!, incident.longitude!),
        width: 46,
        height: 46,
        child: Tooltip(
          message:
              '${incident.categoryName} - ${incident.severity} system-assigned',
          child: GestureDetector(
            onTap: () => _showIncident(incident),
            child: Container(
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: const [
                  BoxShadow(
                    color: Colors.black26,
                    blurRadius: 4,
                    offset: Offset(0, 2),
                  ),
                ],
              ),
              child: const Icon(
                Icons.warning_rounded,
                color: Colors.white,
                size: 23,
              ),
            ),
          ),
        ),
      );
    });

    final routeMarkers = <Marker>[];
    if (_routeStart case final start?) {
      routeMarkers.add(_routeEndpointMarker(start, 'A', Colors.green.shade800));
    }
    if (_routeDestination case final destination?) {
      routeMarkers.add(
        _routeEndpointMarker(destination, 'B', Colors.blue.shade800),
      );
    }
    return [...markers, ...routeMarkers];
  }

  Marker _routeEndpointMarker(LatLng point, String label, Color color) =>
      Marker(
        point: point,
        width: 38,
        height: 38,
        child: CircleAvatar(
          backgroundColor: color,
          foregroundColor: Colors.white,
          child: Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      );

  List<CircleMarker> _buildDensityCircles() {
    final clusters = <String, _DensityCluster>{};
    for (final incident in _mappableIncidents) {
      final clusterKey =
          '${incident.latitude!.toStringAsFixed(3)},${incident.longitude!.toStringAsFixed(3)}';
      final cluster = clusters.putIfAbsent(
        clusterKey,
        () => _DensityCluster(LatLng(incident.latitude!, incident.longitude!)),
      );
      cluster.add(incident.severity);
    }

    return clusters.values
        .map((cluster) {
          final radius = math.min(420.0, 85.0 + math.sqrt(cluster.weight) * 58);
          final alpha = (0.12 + math.min(cluster.weight, 8) * 0.025).clamp(
            0.12,
            0.32,
          );
          return CircleMarker(
            point: cluster.center,
            radius: radius,
            useRadiusInMeter: true,
            color: _severityColor(
              cluster.highestSeverity,
            ).withValues(alpha: alpha),
            borderColor: _severityColor(
              cluster.highestSeverity,
            ).withValues(alpha: 0.62),
            borderStrokeWidth: 1,
          );
        })
        .toList(growable: false);
  }

  Future<void> _openFilters() async {
    final filters = await showModalBottomSheet<MapFilters>(
      context: context,
      isScrollControlled: true,
      builder: (context) => MapFilterSheet(
        categories: _categories,
        barangays: _barangays,
        initialFilters: _filters,
      ),
    );
    if (filters != null && mounted) setState(() => _filters = filters);
  }

  void _setMode(_MapMode mode) {
    setState(() {
      _mode = mode;
      _routeStart = null;
      _routeDestination = null;
      _routePlan = null;
      _routeError = null;
    });
  }

  void _handleMapTap(LatLng point) {
    if (_mode != _MapMode.route) return;
    if (!isWithinTaguigMapArea(point)) {
      _showOutOfScopeMessage();
      return;
    }
    setState(() {
      _routeError = null;
      _routePlan = null;
      if (_routeStart == null || _routeDestination != null) {
        _routeStart = point;
        _routeDestination = null;
      } else {
        _routeDestination = point;
      }
    });
  }

  Future<void> _analyzeRoute() async {
    final start = _routeStart;
    final destination = _routeDestination;
    if (start == null || destination == null) return;
    if (!isWithinTaguigMapArea(start) || !isWithinTaguigMapArea(destination)) {
      _showOutOfScopeMessage();
      return;
    }

    setState(() {
      _routeLoading = true;
      _routeError = null;
    });
    try {
      final plan = await _routeService.fetchRoute(
        start: start,
        destination: destination,
      );
      if (!mounted) return;
      setState(() {
        _routePlan = plan;
        _routeLoading = false;
      });
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => _RouteSummarySheet(plan: plan),
      );
    } on RouteException catch (error) {
      if (!mounted) return;
      setState(() {
        _routeLoading = false;
        _routeError = error.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _routeLoading = false;
        _routeError = 'Unable to analyze this route. Please try again.';
      });
    }
  }

  void _showOutOfScopeMessage() {
    showDialog<void>(
      context: context,
      builder: (context) => const AlertDialog(
        title: Text('Out of Scope'),
        content: Text(
          'This location is outside the Urban Danger coverage area. '
          'Currently, only Taguig City is supported.',
        ),
      ),
    );
  }

  void _showIncident(Incident incident) {
    showModalBottomSheet<void>(
      context: context,
      builder: (context) => _IncidentMarkerSheet(incident: incident),
    );
  }

  Color _severityColor(String severity) => switch (severity.toUpperCase()) {
    'LOW' => Colors.green.shade700,
    'MEDIUM' => Colors.orange.shade800,
    'HIGH' => Theme.of(context).colorScheme.error,
    _ => Theme.of(context).colorScheme.primary,
  };
}

class _DensityCluster {
  _DensityCluster(this.center);

  final LatLng center;
  int weight = 0;
  String highestSeverity = 'LOW';

  void add(String severity) {
    final severityWeight = switch (severity.toUpperCase()) {
      'LOW' => 1,
      'MEDIUM' => 2,
      'HIGH' => 4,
      _ => 1,
    };
    weight += severityWeight;
    if (severityWeight > _weightOf(highestSeverity)) highestSeverity = severity;
  }

  int _weightOf(String severity) => switch (severity.toUpperCase()) {
    'LOW' => 1,
    'MEDIUM' => 2,
    'HIGH' => 4,
    _ => 1,
  };
}

class _IncidentMarkerSheet extends StatelessWidget {
  const _IncidentMarkerSheet({required this.incident});

  final Incident incident;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    incident.categoryName,
                    style: theme.textTheme.titleLarge,
                  ),
                ),
                Text(incident.severity, style: theme.textTheme.labelLarge),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${_incidentLocationLabel(incident)}  ·  ${_formatDate(context, incident)}',
            ),
            const SizedBox(height: 10),
            Text(
              incident.description,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Text('Source: ${incident.sourceName}'),
            if (incident.sourcePublishedAt != null)
              Text('Published: ${incident.sourcePublishedAt}'),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.verified_outlined, size: 18),
                const SizedBox(width: 6),
                const Text('Verified report'),
                const Spacer(),
                TextButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    Navigator.of(context).push(
                      MaterialPageRoute<void>(
                        builder: (context) =>
                            IncidentDetailsScreen(incident: incident),
                      ),
                    );
                  },
                  icon: const Icon(Icons.open_in_new),
                  label: const Text('Details'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _RouteSummarySheet extends StatelessWidget {
  const _RouteSummarySheet({required this.plan});

  final RoutePlan plan;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final distanceLabel = plan.distanceMeters >= 1000
        ? '${(plan.distanceMeters / 1000).toStringAsFixed(1)} km'
        : '${plan.distanceMeters.round()} m';
    final durationMinutes = (plan.durationSeconds / 60).round();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Route analysis', style: theme.textTheme.titleLarge),
              const SizedBox(height: 6),
              Text('$distanceLabel  ·  about $durationMinutes min by road'),
              const SizedBox(height: 18),
              RouteSafetySummary(intelligence: plan.intelligence),
            ],
          ),
        ),
      ),
    );
  }
}

String _formatDate(BuildContext context, Incident incident) {
  final localDate = incident.incidentDate.toLocal();
  final date = MaterialLocalizations.of(context).formatMediumDate(localDate);
  if (!incident.incidentTimeKnown) return date;
  final time = MaterialLocalizations.of(
    context,
  ).formatTimeOfDay(TimeOfDay.fromDateTime(localDate));
  return '$date at $time';
}

String _incidentLocationLabel(Incident incident) =>
    incident.locationDescription ?? incident.barangay ?? incident.city;
