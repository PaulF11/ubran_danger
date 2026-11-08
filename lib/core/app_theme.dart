// File note: This file handles app_theme.dart.
import 'package:flutter/material.dart';

abstract final class AppTheme {
  static const _black = Color(0xFF000000);
  static const _white = Color(0xFFFFFFFF);
  static const _muted = Color(0xFF666666);
  static const _outline = Color(0xFFE5E5E5);

  static ThemeData get monochrome {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: _black,
      onPrimary: _white,
      secondary: _black,
      onSecondary: _white,
      error: Color(0xFFB3261E),
      onError: _white,
      surface: _white,
      onSurface: _black,
      onSurfaceVariant: _muted,
      outline: _outline,
      outlineVariant: Color(0xFFF0F0F0),
      shadow: _black,
      scrim: _black,
      inverseSurface: _black,
      onInverseSurface: _white,
      inversePrimary: _white,
      surfaceTint: _black,
    );

    final base = ThemeData(
      colorScheme: scheme,
      brightness: Brightness.light,
      useMaterial3: true,
      fontFamily: 'Roboto',
    );

    return base.copyWith(
      scaffoldBackgroundColor: _white,
      textTheme: base.textTheme.copyWith(
        displayLarge: base.textTheme.displayLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -1.2,
          color: _black,
        ),
        headlineLarge: base.textTheme.headlineLarge?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.7,
          color: _black,
        ),
        headlineMedium: base.textTheme.headlineMedium?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.5,
          color: _black,
        ),
        headlineSmall: base.textTheme.headlineSmall?.copyWith(
          fontWeight: FontWeight.w700,
          letterSpacing: -0.35,
          color: _black,
        ),
        titleLarge: base.textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
          color: _black,
        ),
        labelSmall: base.textTheme.labelSmall?.copyWith(
          letterSpacing: 0.45,
          fontWeight: FontWeight.w600,
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: _white,
        foregroundColor: _black,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: _white,
        elevation: 0,
        margin: EdgeInsets.zero,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: BorderSide(color: _outline, width: 0.8),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: _white,
        hintStyle: const TextStyle(color: _muted),
        labelStyle: const TextStyle(color: _muted),
        prefixIconColor: _muted,
        suffixIconColor: _muted,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: const BorderSide(color: _outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: const BorderSide(color: _outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.zero,
          borderSide: const BorderSide(color: _black, width: 1.4),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: _white,
        indicatorColor: Color(0xFFF0F0F0),
        elevation: 0,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            color: _black,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w600
                : FontWeight.w500,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected) ? _black : _muted,
          ),
        ),
      ),
      navigationRailTheme: const NavigationRailThemeData(
        backgroundColor: _white,
        indicatorColor: _black,
        selectedIconTheme: IconThemeData(color: _white),
        unselectedIconTheme: IconThemeData(color: _muted),
        selectedLabelTextStyle: TextStyle(
          color: _black,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelTextStyle: TextStyle(color: _muted, fontSize: 11),
      ),
      dividerTheme: const DividerThemeData(
        color: _outline,
        thickness: 0.8,
        space: 1,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: _white,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: _white,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.zero,
          side: const BorderSide(color: _outline),
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        side: const BorderSide(color: _outline),
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.zero),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: _black,
        linearTrackColor: _outline,
      ),
    );
  }
}
