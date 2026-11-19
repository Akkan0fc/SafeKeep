import 'package:appwrite/appwrite.dart';
import 'package:appwrite/models.dart' as models;
import '../models/chat_contact_model.dart';
import '../models/item_model.dart';
import '../models/message_model.dart';
import '../models/user_model.dart';
import '../utils/config.dart';
import 'appwrite_service.dart';
import 'auth_service.dart';

class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  factory DatabaseService() => _instance;
  DatabaseService._internal();

  String get _databaseId => AppConfig.appwriteDatabaseId;

  Future<ItemModel> createItem({
    required String type, required String title, required String description,
    required String imageFileId, String? location, double? latitude,
    double? longitude, String? collegeId, List<double>? embedding, String? aiCaption,
  }) async {
    final auth = AuthService();
    final document = await AppwriteService.databases.createDocument(
      databaseId: _databaseId, collectionId: AppConfig.appwriteItemsCollectionId,
      documentId: ID.unique(),
      data: {
        'type': type, 'title': title, 'description': description,
        'image_file_id': imageFileId, 'location': location ?? '',
        'latitude': latitude, 'longitude': longitude, 'user_id': auth.userId,
        'user_name': auth.userName, 'college_id': collegeId ?? 'default',
        'status': 'open', 'ai_caption': aiCaption ?? '',
        'embedding': embedding?.join(',') ?? '',
      },
      permissions: [
        Permission.read(Role.users()),
        Permission.update(Role.user(auth.userId)),
        Permission.delete(Role.user(auth.userId)),
      ],
    );
    return _mapToItem(document);
  }

  Future<List<ItemModel>> getItems({String? type, String? status, int limit = 50}) async {
    final queries = <String>[Query.orderDesc('\$createdAt'), Query.limit(limit)];
    if (type != null) queries.add(Query.equal('type', [type]));
    if (status != null) queries.add(Query.equal('status', [status]));
    final result = await AppwriteService.databases.listDocuments(
      databaseId: _databaseId, collectionId: AppConfig.appwriteItemsCollectionId, queries: queries,
    );
    return result.documents.map(_mapToItem).toList();
  }

  Future<List<ItemModel>> getMyItems() async {
    final result = await AppwriteService.databases.listDocuments(
      databaseId: _databaseId, collectionId: AppConfig.appwriteItemsCollectionId,
      queries: [Query.equal('user_id', [AuthService().userId]), Query.orderDesc('\$createdAt'), Query.limit(200)],
    );
    return result.documents.map(_mapToItem).toList();
  }

  Future<ItemModel> getItem(String itemId) async => _mapToItem(
    await AppwriteService.databases.getDocument(
      databaseId: _databaseId, collectionId: AppConfig.appwriteItemsCollectionId, documentId: itemId,
    ),
  );

  Future<List<ItemModel>> getCandidateItems(String oppositeType) async {
    final result = await AppwriteService.databases.listDocuments(
      databaseId: _databaseId, collectionId: AppConfig.appwriteItemsCollectionId,
      queries: [Query.equal('type', [oppositeType]), Query.equal('status', ['open']), Query.limit(200)],
    );
    return result.documents.map(_mapToItem).toList();
  }

  Future<void> updateItemStatus(String itemId, String status) => _updateItem(itemId, {'status': status});
  Future<void> updateItemAI(String itemId, {required List<double> embedding, required String caption}) =>
      _updateItem(itemId, {'embedding': embedding.join(','), 'ai_caption': caption});
  Future<void> _updateItem(String itemId, Map<String, dynamic> data) => AppwriteService.databases.updateDocument(
    databaseId: _databaseId, collectionId: AppConfig.appwriteItemsCollectionId, documentId: itemId, data: data,
  );
  Future<void> deleteItem(String itemId) => AppwriteService.databases.deleteDocument(
    databaseId: _databaseId, collectionId: AppConfig.appwriteItemsCollectionId, documentId: itemId,
  );

  Future<void> saveUserProfile({
    required String userId, required String name, required String email, String? phone,
    String? collegeId, String? collegeName, String? whatsapp,
  }) async {
    final data = {'name': name, 'email': email, 'phone': phone ?? '', 'college_id': collegeId ?? 'default',
      'college_name': collegeName ?? '', 'whatsapp': whatsapp ?? ''};
    try {
      await AppwriteService.databases.updateDocument(
        databaseId: _databaseId, collectionId: AppConfig.appwriteUsersCollectionId, documentId: userId, data: data,
      );
    } on AppwriteException {
      await AppwriteService.databases.createDocument(
        databaseId: _databaseId, collectionId: AppConfig.appwriteUsersCollectionId, documentId: userId, data: data,
        permissions: [Permission.read(Role.users()), Permission.update(Role.user(userId))],
      );
    }
  }

  Future<UserModel?> getUserById(String userId) async {
    try {
      final document = await AppwriteService.databases.getDocument(
        databaseId: _databaseId, collectionId: AppConfig.appwriteUsersCollectionId, documentId: userId,
      );
      return UserModel.fromMap({...document.data, 'id': document.$id, 'created_at': document.$createdAt});
    } on AppwriteException { return null; }
  }

  Future<MessageModel> sendMessage({required String itemId, required String receiverId, required String message}) async {
    final auth = AuthService();
    final document = await AppwriteService.databases.createDocument(
      databaseId: _databaseId, collectionId: AppConfig.appwriteMessagesCollectionId, documentId: ID.unique(),
      data: {'item_id': itemId, 'sender_id': auth.userId, 'sender_name': auth.userName,
        'receiver_id': receiverId, 'message': message, 'is_read': false},
      permissions: [
        Permission.read(Role.user(auth.userId)), Permission.read(Role.user(receiverId)),
        Permission.update(Role.user(auth.userId)), Permission.update(Role.user(receiverId)),
      ],
    );
    return _mapToMessage(document);
  }

  Future<List<MessageModel>> getMessages({required String itemId, required String otherUserId}) async {
    final result = await _listMyMessages(itemId: itemId);
    final myId = AuthService().userId;
    final messages = result.where((message) =>
      (message.senderId == myId && message.receiverId == otherUserId) ||
      (message.senderId == otherUserId && message.receiverId == myId)).toList();
    messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return messages;
  }

  Future<List<ChatContactModel>> getItemChatContacts(String itemId) async {
    final myId = AuthService().userId;
    final messages = await _listMyMessages(itemId: itemId);
    messages.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    final threads = <String, ChatContactModel>{};
    for (final row in messages) {
      final otherId = row.senderId == myId ? row.receiverId : row.senderId;
      final unread = row.senderId != myId && !row.isRead;
      final existing = threads[otherId];
      threads[otherId] = ChatContactModel(
        otherUserId: otherId, otherUserName: row.senderId == myId ? 'User' : row.senderName,
        lastMessage: existing?.lastMessage ?? row.message, lastMessageAt: existing?.lastMessageAt ?? row.createdAt,
        unreadCount: (existing?.unreadCount ?? 0) + (unread ? 1 : 0),
      );
    }
    return threads.values.toList();
  }

  Future<List<MessageModel>> _listMyMessages({required String itemId}) async {
    final result = await AppwriteService.databases.listDocuments(
      databaseId: _databaseId, collectionId: AppConfig.appwriteMessagesCollectionId,
      queries: [Query.equal('item_id', [itemId]), Query.limit(500)],
    );
    return result.documents.map(_mapToMessage).toList();
  }

  Future<void> markMessagesAsRead({required String itemId, required String senderId}) async {
    final messages = await _listMyMessages(itemId: itemId);
    final myId = AuthService().userId;
    for (final message in messages.where((m) => m.senderId == senderId && m.receiverId == myId && !m.isRead)) {
      await AppwriteService.databases.updateDocument(
        databaseId: _databaseId, collectionId: AppConfig.appwriteMessagesCollectionId,
        documentId: message.id, data: {'is_read': true},
      );
    }
  }

  ItemModel _mapToItem(models.Document document) {
    final map = document.data;
    final rawEmbedding = map['embedding'] as String? ?? '';
    final embedding = rawEmbedding.isEmpty ? null : rawEmbedding.split(',').map((v) => double.tryParse(v) ?? 0).toList();
    return ItemModel(id: document.$id, type: map['type'] ?? 'lost', title: map['title'] ?? '',
      description: map['description'] ?? '', imageFileId: map['image_file_id'] ?? '', location: map['location'],
      latitude: (map['latitude'] as num?)?.toDouble(), longitude: (map['longitude'] as num?)?.toDouble(),
      userId: map['user_id'] ?? '', userName: map['user_name'] ?? 'Unknown', collegeId: map['college_id'],
      status: map['status'] ?? 'open', embedding: embedding, aiCaption: map['ai_caption'],
      createdAt: DateTime.parse(document.$createdAt), updatedAt: DateTime.parse(document.$updatedAt));
  }

  MessageModel _mapToMessage(models.Document document) => MessageModel.fromMap(
    {...document.data, 'id': document.$id, 'created_at': document.$createdAt},
  );
}
