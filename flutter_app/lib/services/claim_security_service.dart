import 'dart:convert';
import 'dart:math';

import 'package:shared_preferences/shared_preferences.dart';

class ClaimQuestion {
  final String prompt;
  final String answer;

  const ClaimQuestion({
    required this.prompt,
    required this.answer,
  });

  Map<String, dynamic> toMap() {
    return {
      'prompt': prompt,
      'answer': answer,
    };
  }

  factory ClaimQuestion.fromMap(Map<String, dynamic> map) {
    return ClaimQuestion(
      prompt: map['prompt']?.toString() ?? '',
      answer: map['answer']?.toString() ?? '',
    );
  }
}

class ClaimSecurityProfile {
  final String itemId;
  final String claimCode;
  final String qrPayload;
  final List<ClaimQuestion> questions;

  const ClaimSecurityProfile({
    required this.itemId,
    required this.claimCode,
    required this.qrPayload,
    required this.questions,
  });

  bool get hasQuestions => questions.isNotEmpty;

  Map<String, dynamic> toMap() {
    return {
      'itemId': itemId,
      'claimCode': claimCode,
      'qrPayload': qrPayload,
      'questions': questions.map((q) => q.toMap()).toList(),
    };
  }

  factory ClaimSecurityProfile.fromMap(Map<String, dynamic> map) {
    final rawQuestions = map['questions'];
    return ClaimSecurityProfile(
      itemId: map['itemId']?.toString() ?? '',
      claimCode: map['claimCode']?.toString() ?? '',
      qrPayload: map['qrPayload']?.toString() ?? '',
      questions: rawQuestions is List
          ? rawQuestions
              .whereType<Map>()
              .map((question) => ClaimQuestion.fromMap(
                    Map<String, dynamic>.from(question),
                  ))
              .where((question) =>
                  question.prompt.trim().isNotEmpty &&
                  question.answer.trim().isNotEmpty)
              .toList()
          : const [],
    );
  }
}

class ClaimVerificationResult {
  final bool success;
  final int matchedAnswers;
  final int totalQuestions;
  final String message;

  const ClaimVerificationResult({
    required this.success,
    required this.matchedAnswers,
    required this.totalQuestions,
    required this.message,
  });
}

class ClaimSecurityService {
  ClaimSecurityService._internal();

  static final ClaimSecurityService _instance =
      ClaimSecurityService._internal();

  factory ClaimSecurityService() => _instance;

  static const String _prefix = 'claim_security_profile_';

  Future<ClaimSecurityProfile> createProfile({
    required String itemId,
    required String title,
    required String ownerName,
    List<ClaimQuestion> questions = const [],
  }) async {
    final claimCode = _generateClaimCode(title: title, ownerName: ownerName);
    final profile = ClaimSecurityProfile(
      itemId: itemId,
      claimCode: claimCode,
      qrPayload: 'campus-lost-found://claim/$itemId/$claimCode',
      questions: questions
          .where(
              (q) => q.prompt.trim().isNotEmpty && q.answer.trim().isNotEmpty)
          .toList(),
    );
    await saveProfile(profile);
    return profile;
  }

  Future<void> saveProfile(ClaimSecurityProfile profile) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_prefix${profile.itemId}',
      jsonEncode(profile.toMap()),
    );
  }

  Future<ClaimSecurityProfile?> getProfile(String itemId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_prefix$itemId');
    if (raw == null || raw.isEmpty) return null;

    try {
      return ClaimSecurityProfile.fromMap(
        Map<String, dynamic>.from(jsonDecode(raw) as Map),
      );
    } catch (_) {
      return null;
    }
  }

  Future<ClaimVerificationResult> verifyClaim({
    required ClaimSecurityProfile profile,
    required String claimCode,
    required List<String> responses,
  }) async {
    final normalizedCode = claimCode.trim().toUpperCase();
    if (normalizedCode != profile.claimCode.toUpperCase()) {
      return const ClaimVerificationResult(
        success: false,
        matchedAnswers: 0,
        totalQuestions: 0,
        message: 'Claim code does not match this item.',
      );
    }

    if (profile.questions.isEmpty) {
      return const ClaimVerificationResult(
        success: true,
        matchedAnswers: 0,
        totalQuestions: 0,
        message: 'Claim code verified. The item is ready to be marked claimed.',
      );
    }

    var matches = 0;
    for (var i = 0; i < profile.questions.length; i++) {
      final expected = _normalize(profile.questions[i].answer);
      final actual = i < responses.length ? _normalize(responses[i]) : '';
      if (actual.isNotEmpty && _fuzzyMatch(expected, actual)) {
        matches++;
      }
    }

    final success = matches == profile.questions.length;
    return ClaimVerificationResult(
      success: success,
      matchedAnswers: matches,
      totalQuestions: profile.questions.length,
      message: success
          ? 'Proof of ownership verified successfully.'
          : 'Ownership answers did not fully match. Please try again.',
    );
  }

  String _generateClaimCode({
    required String title,
    required String ownerName,
  }) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final seed =
        '${title.trim()}|${ownerName.trim()}|${DateTime.now().microsecondsSinceEpoch}';
    final random = Random(seed.hashCode);
    final buffer = StringBuffer('LF-');
    for (var i = 0; i < 6; i++) {
      buffer.write(chars[random.nextInt(chars.length)]);
    }
    return buffer.toString();
  }

  String _normalize(String value) {
    return value
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ');
  }

  bool _fuzzyMatch(String expected, String actual) {
    if (actual.isEmpty || expected.isEmpty) return false;
    if (actual == expected) return true;
    if (actual.contains(expected) || expected.contains(actual)) return true;

    final compactExp = expected.replaceAll(' ', '');
    final compactAct = actual.replaceAll(' ', '');
    if (compactExp == compactAct ||
        compactAct.contains(compactExp) ||
        (compactAct.length >= 4 && compactExp.contains(compactAct))) {
      return true;
    }

    const stopWords = {
      'a', 'an', 'the', 'it', 'its', 'is', 'are', 'was', 'were',
      'has', 'have', 'had', 'with', 'on', 'in', 'at', 'to', 'for', 'of',
      'and', 'or', 'my', 'your', 'this', 'that', 'there',
      'some', 'one', 'side', 'back', 'front', 'attached', 'like', 'i'
    };

    final expTokens = expected
        .split(' ')
        .where((t) => t.isNotEmpty && !stopWords.contains(t))
        .toList();
    final actTokens = actual
        .split(' ')
        .where((t) => t.isNotEmpty && !stopWords.contains(t))
        .toList();

    if (expTokens.isEmpty || actTokens.isEmpty) return false;

    var matched = 0;
    for (final et in expTokens) {
      var bestSim = 0.0;
      for (final at in actTokens) {
        final sim = _tokenSimilarity(et, at);
        if (sim > bestSim) bestSim = sim;
      }
      if (bestSim >= 0.75) {
        matched++;
      }
    }

    final coverage = matched / expTokens.length;
    if (coverage >= 0.50 && (matched >= 2 || (matched == 1 && expTokens.length <= 2))) {
      return true;
    }

    final phraseDist = _levenshteinDistance(expected, actual);
    final maxLen = max(expected.length, actual.length);
    if (maxLen > 0 && (1.0 - phraseDist / maxLen) >= 0.70) {
      return true;
    }

    return false;
  }

  double _tokenSimilarity(String w1, String w2) {
    if (w1 == w2) return 1.0;
    if (w1.length >= 4 && w2.length >= 4) {
      if (w1.startsWith(w2) || w2.startsWith(w1)) return 0.92;
      if (w1.endsWith(w2) || w2.endsWith(w1)) return 0.90;
    }
    final maxLen = max(w1.length, w2.length);
    if (maxLen == 0) return 1.0;
    return 1.0 - (_levenshteinDistance(w1, w2) / maxLen);
  }

  int _levenshteinDistance(String s1, String s2) {
    if (s1 == s2) return 0;
    if (s1.isEmpty) return s2.length;
    if (s2.isEmpty) return s1.length;

    final m = s1.length;
    final n = s2.length;
    var prev = List<int>.generate(n + 1, (i) => i);
    var curr = List<int>.filled(n + 1, 0);

    for (var i = 1; i <= m; i++) {
      curr[0] = i;
      final c1 = s1.codeUnitAt(i - 1);
      for (var j = 1; j <= n; j++) {
        final c2 = s2.codeUnitAt(j - 1);
        final cost = c1 == c2 ? 0 : 1;
        curr[j] = min(
          curr[j - 1] + 1,
          min(prev[j] + 1, prev[j - 1] + cost),
        );
      }
      final temp = prev;
      prev = curr;
      curr = temp;
    }
    return prev[n];
  }
}
