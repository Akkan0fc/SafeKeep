import 'package:appwrite/appwrite.dart';
import 'package:appwrite/models.dart' as models;
import 'appwrite_service.dart';

class AuthService {
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  models.User? _currentUser;
  models.User? get currentUser => _currentUser;
  bool get isLoggedIn => _currentUser != null;
  String get userId => _currentUser?.$id ?? '';
  String get userName => _currentUser?.name ?? 'Unknown';
  String get userEmail => _currentUser?.email ?? '';

  Future<bool> checkSession() async {
    try {
      _currentUser = await AppwriteService.account.get();
      return true;
    } on AppwriteException {
      _currentUser = null;
      return false;
    }
  }

  Future<models.User> signUp({
    required String name,
    required String email,
    required String password,
  }) async {
    try {
      await AppwriteService.account.create(
        userId: ID.unique(), email: email, password: password, name: name,
      );
      await AppwriteService.account.createEmailPasswordSession(
        email: email, password: password,
      );
      _currentUser = await AppwriteService.account.get();
      return _currentUser!;
    } on AppwriteException catch (e) {
      throw e.message ?? 'Signup failed. Please try again.';
    }
  }

  Future<models.User> login({required String email, required String password}) async {
    try {
      await AppwriteService.account.createEmailPasswordSession(
        email: email, password: password,
      );
      _currentUser = await AppwriteService.account.get();
      return _currentUser!;
    } on AppwriteException catch (e) {
      throw e.message ?? 'Login failed.';
    }
  }

  Future<void> logout() async {
    await AppwriteService.account.deleteSession(sessionId: 'current');
    _currentUser = null;
  }

  Future<void> updateName(String name) async {
    _currentUser = await AppwriteService.account.updateName(name: name);
  }
}
