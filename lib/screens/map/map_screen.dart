// File note: This file handles map_screen.dart.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/incident.dart';
import '../../models/route_plan.dart';
import '../../core/taguig_region.dart';
import '../../services/incident_service.dart';
import '../../services/location_service.dart';
import '../../services/location_search_service.dart';
import '../../services/nearby_incident_alert_tracker.dart';
import '../../services/nearby_notification_service.dart';
import '../../services/route_service.dart';
import '../incidents/incident_details_screen.dart';
import 'map_filter_sheet.dart';
import 'route_safety_summary.dart';

class MapScreen extends StatefulWidget {
  const MapScreen({
    super.key,
    this.incidentService,
    this.routeService,
    this.locationSearchService,
  });

  final IncidentService? incidentService;
  final RouteService? routeService;
  final LocationSearchService? locationSearchService;

  @override
  State<MapScreen> createState() => _MapScreenState();
}

enum _MapMode { incidents, route }

class _MapScreenState extends State<MapScreen> with WidgetsBindingObserver {
  final MapController _mapController = MapController();
  late final IncidentService _incidentService =
      widget.incidentService ?? IncidentService();
  late final RouteService _routeService = widget.routeService ?? RouteService();
  late final LocationSearchService _locationSearchService =
      widget.locationSearchService ?? LocationSearchService();
  final LocationService _locationService = LocationService();
  final NearbyNotificationService _notificationService =
      NearbyNotificationService();
  final NearbyIncidentAlertTracker _alertTracker = NearbyIncidentAlertTracker();
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
  String _routeTravelMode = 'car';
  List<RoutePlan> _routePlans = const [];
  int _selectedRouteIndex = 0;
  bool _routeLoading = false;
  String? _routeError;
  int _routeRequestGeneration = 0;
  StreamSubscription<Position>? _locationSubscription;
  Position? _currentPosition;
  bool _locationTracking = false;
  bool _nearbyAlertsEnabled = false;
  bool _permissionPromptInProgress = false;
  String? _locationMessage;

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
    WidgetsBinding.instance.addObserver(this);
    _loadIncidents();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed ||
        (state == AppLifecycleState.inactive && _permissionPromptInProgress)) {
      return;
    }
    if (_locationTracking) {
      unawaited(
        _disableLocation(
          message:
              'Location tracking stopped when Urban Danger left the foreground.',
        ),
      );
    }
  }

  Future<void> _loadIncidents() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final incidents = await _incidentService.fetchIncidents(
        view: IncidentFeedView.all,
      );
      if (!mounted) return;
      setState(() {
        _incidents = incidents;
        _isLoading = false;
      });
      final position = _currentPosition;
      if (_nearbyAlertsEnabled && position != null) {
        _checkNearbyIncidents(LatLng(position.latitude, position.longitude));
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMessage = error is IncidentApiException
            ? error.message
            : 'Unable to load Taguig City and Pateros incidents. Check your connection and retry.';
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _locationSubscription?.cancel();
    _searchController.dispose();
    _incidentService.close();
    _routeService.close();
    _locationSearchService.close();
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
            if (_routePlans.isNotEmpty)
              PolylineLayer(
                polylines: _routePlans.indexed
                    .map(
                      (entry) => Polyline(
                        points: entry.$2.points,
                        color: entry.$1 == _selectedRouteIndex
                            ? Theme.of(context).colorScheme.primary
                            : Colors.blueGrey.withValues(alpha: 0.62),
                        strokeWidth: entry.$1 == _selectedRouteIndex ? 6 : 4,
                        borderColor: Colors.white,
                        borderStrokeWidth: 2,
                      ),
                    )
                    .toList(growable: false),
              ),
            MarkerLayer(markers: _buildMarkers(context)),
            Positioned(
              left: 8,
              bottom: 8,
              child: SafeArea(
                top: false,
                child: ConstrainedBox(
                  constraints: BoxConstraints(
                    maxWidth: MediaQuery.sizeOf(context).width - 20,
                  ),
                  child: Material(
                    color: const Color(0xEFFFFFFF),
                    borderRadius: BorderRadius.zero,
                    child: const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                      child: Text(
                        '© OpenStreetMap contributors',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: Colors.black87, fontSize: 11),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
        if (_isLoading) _buildLoadingIndicator(context),
        _buildTopControls(context),
        if (_tileError) _buildTileError(context),
        if (!_isLoading && _errorMessage != null) _buildApiError(context),
        if (!_isLoading && _errorMessage == null && _visibleIncidents.isEmpty)
          _buildEmptyResults(context),
        if (_mode == _MapMode.route) _buildRouteControls(context),
        if (_locationMessage != null) _buildLocationMessage(context),
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
    final searchField = TextField(
      controller: _searchController,
      onChanged: (value) => setState(() => _query = value),
      textInputAction: TextInputAction.search,
      maxLines: 1,
      decoration: InputDecoration(
        hintText: 'Search Taguig City and Pateros incidents',
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
    );
    final actionButtons = [
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
        onPressed: () => setState(() => _showDensity = !_showDensity),
        color: _showDensity ? theme.colorScheme.primary : null,
        icon: const Icon(Icons.blur_on_outlined),
      ),
      IconButton(
        tooltip: _locationTracking && _currentPosition != null
            ? 'Center on current location'
            : 'Return to Taguig view',
        onPressed: () {
          final position = _currentPosition;
          if (_locationTracking && position != null) {
            _mapController.move(
              LatLng(position.latitude, position.longitude),
              15,
            );
          } else {
            _mapController.move(taguigMapCenter, taguigMapInitialZoom);
          }
        },
        icon: const Icon(Icons.my_location_outlined),
      ),
    ];
    return Positioned(
      top: 10,
      left: 10,
      right: 10,
      child: SafeArea(
        bottom: false,
        child: Material(
          elevation: 6,
          color: theme.colorScheme.surface.withValues(alpha: 0.96),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.zero,
            side: BorderSide(
              color: theme.colorScheme.outline.withValues(alpha: 0.8),
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Column(
              children: [
                LayoutBuilder(
                  builder: (context, constraints) {
                    if (constraints.maxWidth < 520) {
                      return Column(
                        children: [
                          searchField,
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: actionButtons,
                          ),
                        ],
                      );
                    }
                    return Row(
                      children: [
                        Expanded(child: searchField),
                        ...actionButtons,
                      ],
                    );
                  },
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
                Padding(
                  padding: const EdgeInsets.only(top: 7),
                  child: Wrap(
                    alignment: WrapAlignment.center,
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      OutlinedButton.icon(
                        onPressed: _locationTracking
                            ? _disableLocation
                            : _enableLocation,
                        icon: Icon(
                          _locationTracking
                              ? Icons.location_disabled_outlined
                              : Icons.my_location_outlined,
                        ),
                        label: Text(
                          _locationTracking ? 'Stop location' : 'Use location',
                        ),
                      ),
                      TextButton.icon(
                        onPressed: _nearbyAlertsEnabled
                            ? _disableNearbyAlerts
                            : _enableNearbyAlerts,
                        icon: Icon(
                          _nearbyAlertsEnabled
                              ? Icons.notifications_active_outlined
                              : Icons.notifications_none_outlined,
                        ),
                        label: Text(
                          _nearbyAlertsEnabled ? 'Alerts on' : 'Nearby alerts',
                        ),
                      ),
                    ],
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

  Widget _buildLocationMessage(BuildContext context) => Positioned(
    left: 20,
    right: 20,
    bottom: 76,
    child: SafeArea(
      top: false,
      child: Material(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.zero,
        elevation: 4,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            children: [
              const Icon(Icons.info_outline),
              const SizedBox(width: 8),
              Expanded(child: Text(_locationMessage!)),
              if (_locationMessage!.contains('Settings'))
                TextButton(
                  onPressed: _openLocationSettings,
                  child: Text(kIsWeb ? 'How to enable' : 'Settings'),
                ),
              IconButton(
                tooltip: 'Dismiss location message',
                onPressed: () => setState(() => _locationMessage = null),
                icon: const Icon(Icons.close),
              ),
            ],
          ),
        ),
      ),
    ),
  );

  Future<bool> _confirmLocationUse({required bool forAlerts}) async {
    final approved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(forAlerts ? 'Enable nearby alerts?' : 'Use your location?'),
        content: Text(
          forAlerts
              ? 'While this map is open, Urban Danger checks your current location against verified Taguig City and Pateros incidents to alert you nearby. Location is not stored or tracked in the background. Notification permission is requested separately; browser alerts require a supported browser and permission.'
              : 'While this map is open, Urban Danger uses your location to show your position, help set a route start, and compare nearby verified incidents. Location is not stored or tracked in the background.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Continue'),
          ),
        ],
      ),
    );
    return approved == true;
  }

  Future<bool> _enableLocation({bool showRationale = true}) async {
    if (_locationTracking) return true;
    if (showRationale && !await _confirmLocationUse(forAlerts: false)) {
      return false;
    }
    try {
      _permissionPromptInProgress = true;
      late final LocationAccess access;
      try {
        access = await _locationService.requestAccess();
      } finally {
        _permissionPromptInProgress = false;
      }
      if (!mounted) return false;
      if (WidgetsBinding.instance.lifecycleState != AppLifecycleState.resumed) {
        setState(
          () => _locationMessage =
              'Location access is only started while Urban Danger is foregrounded.',
        );
        return false;
      }
      if (access != LocationAccess.granted) {
        final message = switch (access) {
          LocationAccess.denied =>
            kIsWeb
                ? 'Browser location permission was denied. Allow location for this site in browser Settings to retry. Manual map and route features remain available.'
                : 'Location permission was denied. Manual map and route features remain available.',
          LocationAccess.permanentlyDenied =>
            kIsWeb
                ? 'Browser location permission is blocked. Allow location for this site in browser Settings to retry. Manual map and route features remain available.'
                : 'Location permission is permanently denied. Open app Settings to enable it.',
          LocationAccess.servicesDisabled =>
            kIsWeb
                ? 'Browser location services are unavailable. Check browser Settings; manual map and route features remain available.'
                : 'Location services are off. Open device Settings to enable GPS.',
          LocationAccess.granted => '',
        };
        setState(() => _locationMessage = message);
        return false;
      }
      setState(() {
        _locationTracking = true;
        _locationMessage = null;
      });
      _locationSubscription = _locationService.positions.listen(
        _onPosition,
        onError: _onLocationError,
        cancelOnError: true,
      );
      return true;
    } on LocationServiceException catch (error) {
      if (mounted) setState(() => _locationMessage = error.message);
      return false;
    } on Object catch (error) {
      if (mounted) {
        setState(() => _locationMessage = 'Location is unavailable: $error');
      }
      return false;
    }
  }

  void _onPosition(Position position) {
    if (!mounted) return;
    if (!position.latitude.isFinite || !position.longitude.isFinite) {
      _onLocationError(
        const LocationServiceException(
          'The device returned invalid location coordinates.',
        ),
      );
      return;
    }
    final point = LatLng(position.latitude, position.longitude);
    final isFirstPosition = _currentPosition == null;
    setState(() {
      _currentPosition = position;
      _locationMessage = isWithinTaguigMapArea(point)
          ? null
          : 'Your location is outside the supported coverage area. Manual map features remain available.';
    });
    if (isFirstPosition && isWithinTaguigMapArea(point)) {
      _mapController.move(point, 15);
    }
    if (_routeStart == null &&
        _mode == _MapMode.route &&
        isWithinTaguigMapArea(point)) {
      setState(() => _routeStart = point);
    }
    if (_nearbyAlertsEnabled) _checkNearbyIncidents(point);
  }

  void _onLocationError(Object error) {
    if (!mounted) return;
    unawaited(_locationSubscription?.cancel());
    setState(() {
      _locationTracking = false;
      _currentPosition = null;
      _nearbyAlertsEnabled = false;
      _locationMessage =
          'Location updates stopped: $error. Manual map and route features remain available.';
    });
  }

  Future<void> _disableLocation({
    String message = 'Location tracking stopped.',
  }) async {
    await _locationSubscription?.cancel();
    if (!mounted) return;
    setState(() {
      _locationSubscription = null;
      _locationTracking = false;
      _nearbyAlertsEnabled = false;
      _currentPosition = null;
      _locationMessage = message;
    });
  }

  Future<void> _enableNearbyAlerts() async {
    if (!await _confirmLocationUse(forAlerts: true)) return;
    final startedTracking = !_locationTracking;
    if (kIsWeb) {
      try {
        _permissionPromptInProgress = true;
        final notificationGranted = await _notificationService
            .requestPermission();
        _permissionPromptInProgress = false;
        if (!notificationGranted) {
          if (mounted) {
            setState(
              () => _locationMessage =
                  'Browser notifications are unavailable or denied. If blocked, allow notifications for this site in browser Settings. Nearby alerts remain off.',
            );
          }
          return;
        }
      } on Object catch (error) {
        _permissionPromptInProgress = false;
        if (mounted) {
          setState(
            () => _locationMessage =
                'Browser notification permission could not be requested: $error',
          );
        }
        return;
      }
    }
    if (!await _enableLocation(showRationale: false)) return;
    try {
      final notificationGranted = kIsWeb
          ? true
          : await _requestNotificationPermission();
      final appIsForegrounded =
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed;
      if (!notificationGranted || !_locationTracking || !appIsForegrounded) {
        if (startedTracking && _locationTracking) {
          await _disableLocation();
        }
        if (mounted) {
          setState(
            () => _locationMessage = notificationGranted
                ? 'Location tracking paused when the app left the foreground. Nearby alerts remain off.'
                : 'Notification permission is unavailable or denied. Nearby alerts remain off.',
          );
        }
        return;
      }
      if (!mounted) return;
      setState(() {
        _nearbyAlertsEnabled = true;
        _locationMessage =
            'Nearby verified-incident alerts are on while the map is open.';
      });
      final position = _currentPosition;
      if (position != null) {
        _checkNearbyIncidents(LatLng(position.latitude, position.longitude));
      }
    } on Object catch (error) {
      if (startedTracking) await _disableLocation();
      if (mounted) {
        setState(
          () => _locationMessage =
              'Notification permission could not be requested: $error',
        );
      }
    }
  }

  Future<bool> _requestNotificationPermission() async {
    _permissionPromptInProgress = true;
    try {
      return await _notificationService.requestPermission();
    } finally {
      _permissionPromptInProgress = false;
    }
  }

  void _disableNearbyAlerts() {
    setState(() {
      _nearbyAlertsEnabled = false;
      _locationMessage = 'Nearby alerts are off.';
    });
  }

  void _checkNearbyIncidents(LatLng point) {
    final alerts = _alertTracker.update(position: point, incidents: _incidents);
    for (final alert in alerts) {
      final incident = alert.incident;
      unawaited(
        _notificationService
            .showIncident(
              incidentId: incident.id,
              category: incident.categoryName,
              distanceMeters: alert.distance.round(),
              incidentDate: _formatDate(context, incident),
              sourceName: incident.sourceName,
              sourceUrl: incident.sourceUrl,
            )
            .catchError((Object error) {
              if (mounted) {
                setState(
                  () => _locationMessage =
                      'A nearby alert could not be delivered: $error',
                );
              }
            }),
      );
      if (!mounted) continue;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              '${incident.categoryName} · ${alert.distance.round()} m away · ${_formatDate(context, incident)}',
            ),
            action: incident.sourceUrl == null
                ? null
                : SnackBarAction(
                    label: 'Source',
                    onPressed: () => unawaited(
                      launchUrl(
                        Uri.parse(incident.sourceUrl!),
                        mode: LaunchMode.externalApplication,
                      ),
                    ),
                  ),
            duration: const Duration(seconds: 8),
          ),
        );
    }
  }

  Future<void> _openLocationSettings() async {
    if (kIsWeb) {
      setState(
        () => _locationMessage =
            "Use this site's browser Settings to allow location or notifications, then retry. Manual map and route features remain available.",
      );
      return;
    }
    try {
      final opened = _locationMessage?.contains('GPS') == true
          ? await _locationService.openLocationSettings()
          : await _locationService.openAppSettings();
      if (!opened && mounted) {
        setState(
          () => _locationMessage =
              'Settings could not be opened. Enable location permission or GPS in device Settings.',
        );
      }
    } on Object catch (error) {
      if (mounted) {
        setState(() => _locationMessage = 'Could not open Settings: $error');
      }
    }
  }

  Widget _buildEmptyResults(BuildContext context) => Positioned(
    left: 24,
    right: 24,
    top: MediaQuery.sizeOf(context).height * 0.46,
    child: Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Text(
          _incidents.isEmpty
              ? 'No verified incidents in Taguig City or Pateros are currently available.'
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
        borderRadius: BorderRadius.zero,
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
    final screenSize = MediaQuery.sizeOf(context);
    const routeModes = [
      ('car', 'Car', Icons.directions_car_outlined),
      ('motorcycle', 'Motorcycle', Icons.two_wheeler_outlined),
      ('walking', 'Walk', Icons.directions_walk_outlined),
      ('bicycle', 'Bicycle', Icons.directions_bike_outlined),
      ('truck', 'Truck', Icons.local_shipping_outlined),
    ];

    String distanceLabel(double meters) => meters >= 1000
        ? '${(meters / 1000).toStringAsFixed(1)} km'
        : '${meters.round()} m';

    Widget endpoint(String label, LatLng? point) {
      final value = point == null
          ? 'Tap map or enter coordinates'
          : '${point.latitude.toStringAsFixed(5)}, '
                '${point.longitude.toStringAsFixed(5)}';
      return DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: theme.colorScheme.outlineVariant),
          borderRadius: BorderRadius.zero,
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              Icon(
                label == 'start'
                    ? Icons.trip_origin
                    : Icons.location_on_outlined,
                size: 19,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label == 'start' ? 'START' : 'DESTINATION',
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        letterSpacing: 0.8,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      value,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              IconButton(
                tooltip:
                    'Enter ${label == 'start' ? 'start' : 'destination'} coordinates',
                onPressed: () => _editRouteEndpoint(isStart: label == 'start'),
                icon: const Icon(Icons.edit_location_alt_outlined),
              ),
            ],
          ),
        ),
      );
    }

    final endpointFields = LayoutBuilder(
      builder: (context, constraints) {
        final start = endpoint('start', _routeStart);
        final destination = endpoint('destination', _routeDestination);
        final swapButton = IconButton(
          tooltip: 'Swap start and destination',
          onPressed: !canAnalyze
              ? null
              : () {
                  _invalidateRouteRequest();
                  setState(() {
                    final start = _routeStart;
                    _routeStart = _routeDestination;
                    _routeDestination = start;
                    _routePlans = const [];
                    _selectedRouteIndex = 0;
                    _routeError = null;
                  });
                  unawaited(_analyzeRoute(mode: _routeTravelMode));
                },
          icon: const Icon(Icons.swap_vert),
        );
        if (constraints.maxWidth < 500) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              start,
              Align(alignment: Alignment.centerRight, child: swapButton),
              destination,
            ],
          );
        }
        return Row(
          children: [
            Expanded(child: start),
            swapButton,
            Expanded(child: destination),
          ],
        );
      },
    );

    final routeDetails = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Route analysis',
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        ),
        endpointFields,
        const SizedBox(height: 10),
        const Text(
          'Travel mode',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            for (final mode in routeModes)
              ChoiceChip(
                avatar: Icon(mode.$3, size: 18),
                label: Text(mode.$2),
                selected: _routeTravelMode == mode.$1,
                onSelected: _routeLoading
                    ? null
                    : (selected) {
                        if (selected) _selectRouteTravelMode(mode.$1);
                      },
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          switch (_routeTravelMode) {
            'motorcycle' =>
              'Motorcycle ETA is estimated over a car-road route. Motorcycle-specific routing and restrictions are unavailable.',
            'truck' =>
              'Truck ETA is estimated over a car-road route. Truck restrictions are not modeled.',
            'walking' =>
              'Walking uses a pedestrian routing profile. ETA is provider-supplied, not traffic-aware.',
            'bicycle' =>
              'Bicycle uses a cycling routing profile. ETA is provider-supplied, not traffic-aware.',
            _ =>
              'Car uses the driving route profile. ETA is provider-supplied, not traffic-aware.',
          },
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        if (_routePlans.isNotEmpty) ...[
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${routeModes.firstWhere((mode) => mode.$1 == _routeTravelMode).$2} · '
                    '${_routeModeEtaLabel(_routePlans[_selectedRouteIndex])} · '
                    '${(_routePlans[_selectedRouteIndex].durationSeconds / 60).ceil()} min · '
                    '${distanceLabel(_routePlans[_selectedRouteIndex].distanceMeters)}',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    _routePlans[_selectedRouteIndex].etaDescription,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
        if (_currentPosition case final position?
            when _locationTracking &&
                isWithinTaguigMapArea(
                  LatLng(position.latitude, position.longitude),
                )) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () {
              _invalidateRouteRequest();
              setState(() {
                _routeStart = LatLng(position.latitude, position.longitude);
                _routeDestination = null;
                _routePlans = const [];
                _selectedRouteIndex = 0;
              });
            },
            icon: const Icon(Icons.my_location, size: 18),
            label: const Text('Use current location as start'),
          ),
        ],
        if (_routeError != null) ...[
          const SizedBox(height: 8),
          Text(_routeError!, style: TextStyle(color: theme.colorScheme.error)),
        ],
      ],
    );
    final routeAction = _routeLoading
        ? FilledButton.icon(
            onPressed: null,
            icon: const SizedBox.square(
              dimension: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            label: const Text('Finding route'),
          )
        : FilledButton.icon(
            onPressed: canAnalyze ? _analyzeRoute : null,
            icon: const Icon(Icons.alt_route),
            label: const Text('Analyze route'),
          );
    final routePanel = screenSize.width < 500
        ? SizedBox(
            height: screenSize.height * 0.46,
            child: Card(
              child: Column(
                children: [
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                      child: routeDetails,
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
                    child: SizedBox(width: double.infinity, child: routeAction),
                  ),
                ],
              ),
            ),
          )
        : Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  routeDetails,
                  const SizedBox(height: 8),
                  routeAction,
                ],
              ),
            ),
          );

    return Positioned(
      left: 10,
      right: 10,
      bottom: 10,
      child: SafeArea(
        top: false,
        child: Align(
          alignment: Alignment.bottomCenter,
          child: ConstrainedBox(
            constraints: BoxConstraints(
              maxWidth: 680,
              maxHeight: screenSize.height * 0.46,
            ),
            child: routePanel,
          ),
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
                shape: BoxShape.rectangle,
                border: Border.all(color: Colors.white, width: 2),
                boxShadow: const [],
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
    final location = _currentPosition;
    final currentLocationMarkers = location == null
        ? const <Marker>[]
        : [
            Marker(
              point: LatLng(location.latitude, location.longitude),
              width: 34,
              height: 34,
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.blue.shade700,
                  shape: BoxShape.rectangle,
                  border: Border.all(color: Colors.white, width: 3),
                  boxShadow: const [],
                ),
                child: const Icon(
                  Icons.my_location,
                  color: Colors.white,
                  size: 17,
                ),
              ),
            ),
          ];
    return [...markers, ...routeMarkers, ...currentLocationMarkers];
  }

  Marker _routeEndpointMarker(LatLng point, String label, Color color) =>
      Marker(
        point: point,
        width: 38,
        height: 38,
        child: Container(
          color: color,
          alignment: Alignment.center,
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
    final position = _currentPosition;
    _invalidateRouteRequest();
    setState(() {
      _mode = mode;
      _routeStart =
          mode == _MapMode.route &&
              position != null &&
              isWithinTaguigMapArea(
                LatLng(position.latitude, position.longitude),
              )
          ? LatLng(position.latitude, position.longitude)
          : null;
      _routeDestination = null;
      _routePlans = const [];
      _selectedRouteIndex = 0;
      _routeError = null;
    });
  }

  void _handleMapTap(LatLng point) {
    if (_mode != _MapMode.route) return;
    if (!isWithinTaguigMapArea(point)) {
      _showOutOfScopeMessage();
      return;
    }
    final completingRoute = _routeStart != null && _routeDestination == null;
    _invalidateRouteRequest();
    setState(() {
      _routeError = null;
      _routePlans = const [];
      _selectedRouteIndex = 0;
      if (_routeStart == null || _routeDestination != null) {
        _routeStart = point;
        _routeDestination = null;
      } else {
        _routeDestination = point;
      }
    });
    if (completingRoute) {
      unawaited(_analyzeRoute(mode: _routeTravelMode));
    }
  }

  Future<void> _editRouteEndpoint({required bool isStart}) async {
    final existing = isStart ? _routeStart : _routeDestination;
    var coordinatesInput = existing == null
        ? ''
        : '${existing.latitude.toStringAsFixed(5)}, '
              '${existing.longitude.toStringAsFixed(5)}';
    var suggestions = const <LocationSuggestion>[];
    var searching = false;
    String? searchError;
    final selected = await showDialog<({LatLng? point, String? coordinates})>(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) {
          Future<void> searchLocations() async {
            setDialogState(() {
              searching = true;
              searchError = null;
              suggestions = const [];
            });
            try {
              final results = await _locationSearchService.search(
                coordinatesInput,
              );
              if (!dialogContext.mounted) return;
              setDialogState(() {
                suggestions = results;
                searching = false;
                if (results.isEmpty) {
                  searchError = 'No matching places in Taguig or Pateros.';
                }
              });
            } on Object catch (error) {
              if (!dialogContext.mounted) return;
              setDialogState(() {
                searching = false;
                searchError = error is LocationSearchException
                    ? error.message
                    : 'Place search failed. Try again or enter coordinates.';
              });
            }
          }

          return AlertDialog(
            scrollable: true,
            title: Text('Choose ${isStart ? 'start' : 'destination'} location'),
            content: SizedBox(
              width: 440,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          initialValue: coordinatesInput,
                          autofocus: true,
                          textInputAction: TextInputAction.search,
                          decoration: const InputDecoration(
                            labelText: 'Search places or enter coordinates',
                            hintText: 'Taguig City Hall or 14.5176, 121.0509',
                          ),
                          onChanged: (value) {
                            coordinatesInput = value;
                            if (suggestions.isNotEmpty || searchError != null) {
                              setDialogState(() {
                                suggestions = const [];
                                searchError = null;
                              });
                            }
                          },
                          onFieldSubmitted: (_) => searchLocations(),
                        ),
                      ),
                      const SizedBox(width: 4),
                      IconButton(
                        tooltip: 'Search locations',
                        onPressed: searching ? null : searchLocations,
                        icon: searching
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.search),
                      ),
                    ],
                  ),
                  if (searchError != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          searchError!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ),
                    ),
                  if (suggestions.isNotEmpty)
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 240),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: suggestions.length,
                        separatorBuilder: (_, _) => const Divider(height: 1),
                        itemBuilder: (context, index) {
                          final suggestion = suggestions[index];
                          return ListTile(
                            dense: true,
                            leading: const Icon(Icons.place_outlined),
                            title: Text(
                              suggestion.label,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            subtitle: Text(
                              '${suggestion.point.latitude.toStringAsFixed(5)}, '
                              '${suggestion.point.longitude.toStringAsFixed(5)}',
                            ),
                            onTap: () => Navigator.of(
                              dialogContext,
                            ).pop((point: suggestion.point, coordinates: null)),
                          );
                        },
                      ),
                    ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('Cancel'),
              ),
              FilledButton(
                onPressed: () => Navigator.of(
                  dialogContext,
                ).pop((point: null, coordinates: coordinatesInput)),
                child: const Text('Use location'),
              ),
            ],
          );
        },
      ),
    );
    if (selected == null || !mounted) return;

    final point =
        selected.point ?? _parseRouteCoordinates(selected.coordinates);
    if (point == null || !isWithinTaguigMapArea(point)) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          const SnackBar(
            content: Text(
              'Choose a suggested place or enter valid latitude, longitude coordinates within Taguig or Pateros.',
            ),
          ),
        );
      return;
    }

    _invalidateRouteRequest();
    setState(() {
      if (isStart) {
        _routeStart = point;
      } else {
        _routeDestination = point;
      }
      _routePlans = const [];
      _selectedRouteIndex = 0;
      _routeError = null;
    });
    if (_routeStart != null && _routeDestination != null) {
      unawaited(_analyzeRoute(mode: _routeTravelMode));
    }
  }

  LatLng? _parseRouteCoordinates(String? input) {
    if (input == null) return null;
    final coordinates = input
        .split(RegExp(r'[,;\s]+'))
        .where((part) => part.isNotEmpty)
        .toList(growable: false);
    if (coordinates.length != 2) return null;
    final latitude = double.tryParse(coordinates[0]);
    final longitude = double.tryParse(coordinates[1]);
    if (latitude == null ||
        longitude == null ||
        !latitude.isFinite ||
        !longitude.isFinite) {
      return null;
    }
    return LatLng(latitude, longitude);
  }

  Future<void> _analyzeRoute({String? mode}) async {
    final start = _routeStart;
    final destination = _routeDestination;
    final selectedMode = mode ?? _routeTravelMode;
    if (start == null || destination == null) return;
    if (!isWithinTaguigMapArea(start) || !isWithinTaguigMapArea(destination)) {
      _showOutOfScopeMessage();
      return;
    }

    final requestGeneration = ++_routeRequestGeneration;
    setState(() {
      _routeLoading = true;
      _routeError = null;
    });
    try {
      final analysis = await _routeService.fetchRoutes(
        start: start,
        destination: destination,
        mode: selectedMode,
      );
      if (!mounted || requestGeneration != _routeRequestGeneration) return;
      final selectedIndex = analysis.recommendedRouteIndex ?? 0;
      setState(() {
        _routePlans = analysis.routes;
        _selectedRouteIndex = selectedIndex;
        _routeLoading = false;
      });
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => _RouteSummarySheet(
          analysis: analysis,
          selectedRouteIndex: selectedIndex,
          onSelectRoute: (index) {
            setState(() {
              _selectedRouteIndex = index;
            });
            Navigator.of(context).pop();
          },
        ),
      );
    } on RouteException catch (error) {
      if (!mounted || requestGeneration != _routeRequestGeneration) return;
      setState(() {
        _routeLoading = false;
        _routeError = error.message;
      });
    } catch (_) {
      if (!mounted || requestGeneration != _routeRequestGeneration) return;
      setState(() {
        _routeLoading = false;
        _routeError = 'Unable to analyze this route. Please try again.';
      });
    }
  }

  void _invalidateRouteRequest() {
    _routeRequestGeneration++;
    _routeLoading = false;
  }

  void _selectRouteTravelMode(String mode) {
    if (mode == _routeTravelMode) return;
    _invalidateRouteRequest();
    setState(() {
      _routeTravelMode = mode;
      _routePlans = const [];
      _selectedRouteIndex = 0;
      _routeError = null;
    });
    if (_routeStart != null && _routeDestination != null) {
      unawaited(_analyzeRoute(mode: mode));
    }
  }

  void _showOutOfScopeMessage() {
    showDialog<void>(
      context: context,
      builder: (context) => const AlertDialog(
        title: Text('Out of Scope'),
        content: Text(
          'This location is outside the Urban Danger coverage area. '
          'Currently, only Taguig City and Pateros are supported.',
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

  Color _severityColor(String severity) =>
      _incidentSeverityColor(context, severity);
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
    final severityColor = _incidentSeverityColor(context, incident.severity);
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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'VERIFIED INCIDENT',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.primary,
                          letterSpacing: 1,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        incident.categoryName,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 9,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: severityColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.zero,
                    border: Border.all(
                      color: severityColor.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Text(
                    incident.severity,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: severityColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
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
  const _RouteSummarySheet({
    required this.analysis,
    required this.selectedRouteIndex,
    required this.onSelectRoute,
  });

  final RouteAnalysis analysis;
  final int selectedRouteIndex;
  final ValueChanged<int> onSelectRoute;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final plan = analysis.routes[selectedRouteIndex];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.zero,
                      border: Border.all(
                        color: theme.colorScheme.primary.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Icon(
                      Icons.alt_route_rounded,
                      color: theme.colorScheme.primary,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'ROUTE ANALYSIS',
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.primary,
                            letterSpacing: 1,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Route intelligence',
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              if (analysis.routes.length > 1) ...[
                Text(
                  'Available routes',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                ...analysis.routes.indexed.map((entry) {
                  final route = entry.$2;
                  final count = route.intelligence.nearbyVerifiedIncidentCount;
                  final distanceLabel = route.distanceMeters >= 1000
                      ? '${(route.distanceMeters / 1000).toStringAsFixed(1)} km'
                      : '${route.distanceMeters.round()} m';
                  final durationMinutes = (route.durationSeconds / 60).round();
                  return Card(
                    color: entry.$1 == selectedRouteIndex
                        ? theme.colorScheme.primaryContainer.withValues(
                            alpha: 0.45,
                          )
                        : null,
                    child: ListTile(
                      onTap: () => onSelectRoute(entry.$1),
                      leading: Icon(
                        entry.$1 == selectedRouteIndex
                            ? Icons.radio_button_checked
                            : Icons.radio_button_off,
                        color: theme.colorScheme.primary,
                      ),
                      title: Text(
                        'Route ${entry.$1 + 1}${route.isRecommended ? ' · Suggested' : ''}',
                      ),
                      subtitle: Text(
                        '$distanceLabel · ${route.durationSource == 'estimated' ? 'estimated' : 'provider ETA'} $durationMinutes min · '
                        '${count == null ? 'incident comparison unavailable' : '$count nearby verified incidents'}',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                    ),
                  );
                }),
              ],
              Card(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      Icon(
                        Icons.route_outlined,
                        color: theme.colorScheme.primary,
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          '${_routeModeLabel(plan.routeMode)} · '
                          '${_routeModeEtaLabel(plan)} · '
                          '${_formatDuration(plan.durationSeconds)} · '
                          '${_formatDistance(plan.distanceMeters)}',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
                child: Text(
                  plan.etaDescription,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              if (analysis.recommendedRouteIndex != null ||
                  analysis.methodology.isNotEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(13),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          analysis.recommendedRouteIndex == null
                              ? 'Route comparison'
                              : 'Recommendation and trade-offs',
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          analysis.recommendedRouteIndex == null
                              ? analysis.recommendationReason
                              : '${analysis.recommendationReason} '
                                    'Currently viewing Route '
                                    '${selectedRouteIndex + 1}.',
                        ),
                        if (analysis.methodology.isNotEmpty) ...[
                          const SizedBox(height: 5),
                          Text(
                            analysis.methodology,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 12),
              RouteSafetySummary(intelligence: plan.intelligence),
            ],
          ),
        ),
      ),
    );
  }
}

String _routeModeLabel(String mode) => switch (mode) {
  'car' => 'Car',
  'motorcycle' => 'Motorcycle',
  'walking' => 'Walking',
  'bicycle' => 'Bicycle',
  'truck' => 'Truck',
  _ => mode,
};

String _routeModeEtaLabel(RoutePlan plan) =>
    plan.durationSource == 'estimated' ? 'Estimated ETA' : 'Provider ETA';

String _formatDistance(double meters) => meters >= 1000
    ? '${(meters / 1000).toStringAsFixed(1)} km'
    : '${meters.round()} m';

String _formatDuration(double seconds) {
  final totalMinutes = (seconds / 60).round();
  final hours = totalMinutes ~/ 60;
  final minutes = totalMinutes % 60;
  if (hours == 0) return '$totalMinutes min';
  return minutes == 0 ? '$hours hr' : '$hours hr $minutes min';
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

Color _incidentSeverityColor(BuildContext context, String severity) =>
    switch (severity.toUpperCase()) {
      'LOW' => Colors.green.shade700,
      'MEDIUM' => Colors.orange.shade800,
      'HIGH' => Theme.of(context).colorScheme.error,
      _ => Theme.of(context).colorScheme.primary,
    };
