import 'package:appwrite/appwrite.dart';
import '../utils/config.dart';

/// One shared Appwrite client for authentication, documents, and files.
class AppwriteService {
  AppwriteService._();

  static late final Client client;
  static late final Account account;
  static late final Databases databases;
  static late final Storage storage;

  static void initialize() {
    if (AppConfig.appwriteEndpoint.startsWith('YOUR_') ||
        AppConfig.appwriteProjectId.startsWith('YOUR_')) {
      throw StateError(
        'Configure AppConfig.appwriteEndpoint and AppConfig.appwriteProjectId first. '
        'See APPWRITE_SETUP.md.',
      );
    }

    client = Client()
        .setEndpoint(AppConfig.appwriteEndpoint)
        .setProject(AppConfig.appwriteProjectId);
    account = Account(client);
    databases = Databases(client);
    storage = Storage(client);
  }
}
