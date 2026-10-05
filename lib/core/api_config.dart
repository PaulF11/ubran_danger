class ApiConfig {
  const ApiConfig._();

  static const baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://urbandanger.netlify.app',
  );

  static Uri get baseUri => Uri.parse(baseUrl);
}