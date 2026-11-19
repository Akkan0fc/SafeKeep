class AppConfig {
  // Copy the endpoint and project ID from Appwrite Console > Settings.
  // Appwrite Cloud endpoints end with /v1.
  static const String appwriteEndpoint = 'YOUR_APPWRITE_ENDPOINT';
  static const String appwriteProjectId = 'YOUR_APPWRITE_PROJECT_ID';
  static const String appwriteDatabaseId = 'campus_lost_found';
  static const String appwriteItemsCollectionId = 'items';
  static const String appwriteUsersCollectionId = 'users';
  static const String appwriteMessagesCollectionId = 'messages';
  static const String appwriteImagesBucketId = 'item_images';
  static const String aiServerUrl = 'http://localhost:8000';
  static const double matchThreshold = 0.65;
  static const String appName = 'Campus Lost & Found';
  static const String appTagline = 'AI-Powered Item Recovery';
}
