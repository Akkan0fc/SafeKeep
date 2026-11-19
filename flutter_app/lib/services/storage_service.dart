import 'dart:typed_data';
import 'package:appwrite/appwrite.dart';
import 'package:http/http.dart' as http;
import '../utils/config.dart';
import 'appwrite_service.dart';
import 'auth_service.dart';

class StorageService {
  static final StorageService _instance = StorageService._internal();
  factory StorageService() => _instance;
  StorageService._internal();

  Future<String> uploadImage({required Uint8List fileBytes, required String fileName}) async {
    final file = await AppwriteService.storage.createFile(
      bucketId: AppConfig.appwriteImagesBucketId,
      fileId: ID.unique(),
      file: InputFile.fromBytes(bytes: fileBytes, filename: fileName, contentType: 'image/jpeg'),
      permissions: [
        Permission.read(Role.any()),
        Permission.delete(Role.user(AuthService().userId)),
      ],
    );
    return file.$id;
  }

  String getImageUrl(String fileId) => AppwriteService.storage
      .getFileView(bucketId: AppConfig.appwriteImagesBucketId, fileId: fileId)
      .toString();

  Future<Uint8List> getFileBytes(String fileId) async {
    final response = await http.get(Uri.parse(getImageUrl(fileId)));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('Could not download image (HTTP ${response.statusCode}).');
    }
    return response.bodyBytes;
  }

  Future<void> deleteFile(String fileId) => AppwriteService.storage.deleteFile(
    bucketId: AppConfig.appwriteImagesBucketId, fileId: fileId,
  );
}
