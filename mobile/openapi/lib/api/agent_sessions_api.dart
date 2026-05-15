//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class AgentSessionsApi {
  AgentSessionsApi([ApiClient? apiClient]) : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Append an agent session message
  ///
  /// Append a user-authored message to an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentMessageCreateDto] agentMessageCreateDto (required):
  Future<Response> appendAgentSessionMessageWithHttpInfo(String id, AgentMessageCreateDto agentMessageCreateDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/messages'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentMessageCreateDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Append an agent session message
  ///
  /// Append a user-authored message to an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentMessageCreateDto] agentMessageCreateDto (required):
  Future<AgentMessageResponseDto?> appendAgentSessionMessage(String id, AgentMessageCreateDto agentMessageCreateDto,) async {
    final response = await appendAgentSessionMessageWithHttpInfo(id, agentMessageCreateDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentMessageResponseDto',) as AgentMessageResponseDto;
    
    }
    return null;
  }

  /// Approve or deny an agent tool call
  ///
  /// Record an explicit user approval decision for a pending internal agent tool call.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] toolCallId (required):
  ///
  /// * [AgentToolApprovalDto] agentToolApprovalDto (required):
  Future<Response> approveToolCallWithHttpInfo(String id, String toolCallId, AgentToolApprovalDto agentToolApprovalDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tool-calls/{toolCallId}/approval'
      .replaceAll('{id}', id)
      .replaceAll('{toolCallId}', toolCallId);

    // ignore: prefer_final_locals
    Object? postBody = agentToolApprovalDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Approve or deny an agent tool call
  ///
  /// Record an explicit user approval decision for a pending internal agent tool call.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [String] toolCallId (required):
  ///
  /// * [AgentToolApprovalDto] agentToolApprovalDto (required):
  Future<AgentToolCallResponseDto?> approveToolCall(String id, String toolCallId, AgentToolApprovalDto agentToolApprovalDto,) async {
    final response = await approveToolCallWithHttpInfo(id, toolCallId, agentToolApprovalDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentToolCallResponseDto',) as AgentToolCallResponseDto;
    
    }
    return null;
  }

  /// Cancel an agent session
  ///
  /// Cancel an active AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> cancelAgentSessionWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/cancel'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Cancel an agent session
  ///
  /// Cancel an active AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<AgentSessionResponseDto?> cancelAgentSession(String id,) async {
    final response = await cancelAgentSessionWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSessionResponseDto',) as AgentSessionResponseDto;
    
    }
    return null;
  }

  /// Create an agent session
  ///
  /// Create a personal AI agent session with immutable credential, model, permission plan, and approval mode snapshots.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [AgentSessionCreateDto] agentSessionCreateDto (required):
  Future<Response> createAgentSessionWithHttpInfo(AgentSessionCreateDto agentSessionCreateDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions';

    // ignore: prefer_final_locals
    Object? postBody = agentSessionCreateDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Create an agent session
  ///
  /// Create a personal AI agent session with immutable credential, model, permission plan, and approval mode snapshots.
  ///
  /// Parameters:
  ///
  /// * [AgentSessionCreateDto] agentSessionCreateDto (required):
  Future<AgentSessionResponseDto?> createAgentSession(AgentSessionCreateDto agentSessionCreateDto,) async {
    final response = await createAgentSessionWithHttpInfo(agentSessionCreateDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSessionResponseDto',) as AgentSessionResponseDto;
    
    }
    return null;
  }

  /// Execute the internal searchAssets agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved asset search tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchAssetsToolRequestDto] agentSearchAssetsToolRequestDto (required):
  Future<Response> executeAgentSearchAssetsWithHttpInfo(String id, AgentSearchAssetsToolRequestDto agentSearchAssetsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/search-assets'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentSearchAssetsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal searchAssets agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved asset search tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchAssetsToolRequestDto] agentSearchAssetsToolRequestDto (required):
  Future<Object?> executeAgentSearchAssets(String id, AgentSearchAssetsToolRequestDto agentSearchAssetsToolRequestDto,) async {
    final response = await executeAgentSearchAssetsWithHttpInfo(id, agentSearchAssetsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Retrieve an agent session
  ///
  /// Retrieve an AI agent session by ID. The current user must own this session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getAgentSessionWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Retrieve an agent session
  ///
  /// Retrieve an AI agent session by ID. The current user must own this session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<AgentSessionResponseDto?> getAgentSession(String id,) async {
    final response = await getAgentSessionWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'AgentSessionResponseDto',) as AgentSessionResponseDto;
    
    }
    return null;
  }

  /// List agent session messages
  ///
  /// Retrieve persisted chat messages for an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getAgentSessionMessagesWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/messages'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// List agent session messages
  ///
  /// Retrieve persisted chat messages for an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<List<AgentMessageResponseDto>?> getAgentSessionMessages(String id,) async {
    final response = await getAgentSessionMessagesWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<AgentMessageResponseDto>') as List)
        .cast<AgentMessageResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// List agent sessions
  ///
  /// Retrieve all AI agent sessions owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> getAgentSessionsWithHttpInfo() async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// List agent sessions
  ///
  /// Retrieve all AI agent sessions owned by the current user.
  Future<List<AgentSessionResponseDto>?> getAgentSessions() async {
    final response = await getAgentSessionsWithHttpInfo();
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<AgentSessionResponseDto>') as List)
        .cast<AgentSessionResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// List agent tool calls
  ///
  /// List audited internal tool calls for an AI agent session owned by the current user.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getToolCallsWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tool-calls'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// List agent tool calls
  ///
  /// List audited internal tool calls for an AI agent session owned by the current user.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<List<AgentToolCallResponseDto>?> getToolCalls(String id,) async {
    final response = await getToolCallsWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<AgentToolCallResponseDto>') as List)
        .cast<AgentToolCallResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// Execute the internal listAlbums agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved album list tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListAlbumsToolRequestDto] agentListAlbumsToolRequestDto (required):
  Future<Response> listAlbumsWithHttpInfo(String id, AgentListAlbumsToolRequestDto agentListAlbumsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/list-albums'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentListAlbumsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal listAlbums agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved album list tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListAlbumsToolRequestDto] agentListAlbumsToolRequestDto (required):
  Future<Object?> listAlbums(String id, AgentListAlbumsToolRequestDto agentListAlbumsToolRequestDto,) async {
    final response = await listAlbumsWithHttpInfo(id, agentListAlbumsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the internal readAlbum agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved album read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAlbumToolRequestDto] agentReadAlbumToolRequestDto (required):
  Future<Response> readAlbumWithHttpInfo(String id, AgentReadAlbumToolRequestDto agentReadAlbumToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-album'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAlbumToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readAlbum agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved album read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAlbumToolRequestDto] agentReadAlbumToolRequestDto (required):
  Future<Object?> readAlbum(String id, AgentReadAlbumToolRequestDto agentReadAlbumToolRequestDto,) async {
    final response = await readAlbumWithHttpInfo(id, agentReadAlbumToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the internal readAssetMetadata agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved metadata read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetMetadataToolRequestDto] agentReadAssetMetadataToolRequestDto (required):
  Future<Response> readAssetMetadataWithHttpInfo(String id, AgentReadAssetMetadataToolRequestDto agentReadAssetMetadataToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-asset-metadata'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetMetadataToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readAssetMetadata agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved metadata read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetMetadataToolRequestDto] agentReadAssetMetadataToolRequestDto (required):
  Future<Object?> readAssetMetadata(String id, AgentReadAssetMetadataToolRequestDto agentReadAssetMetadataToolRequestDto,) async {
    final response = await readAssetMetadataWithHttpInfo(id, agentReadAssetMetadataToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the internal readAssetOriginals agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved original read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetOriginalsToolRequestDto] agentReadAssetOriginalsToolRequestDto (required):
  Future<Response> readAssetOriginalsWithHttpInfo(String id, AgentReadAssetOriginalsToolRequestDto agentReadAssetOriginalsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-asset-originals'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetOriginalsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readAssetOriginals agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved original read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetOriginalsToolRequestDto] agentReadAssetOriginalsToolRequestDto (required):
  Future<Object?> readAssetOriginals(String id, AgentReadAssetOriginalsToolRequestDto agentReadAssetOriginalsToolRequestDto,) async {
    final response = await readAssetOriginalsWithHttpInfo(id, agentReadAssetOriginalsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the internal readAssetPreviews agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved preview read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetPreviewsToolRequestDto] agentReadAssetPreviewsToolRequestDto (required):
  Future<Response> readAssetPreviewsWithHttpInfo(String id, AgentReadAssetPreviewsToolRequestDto agentReadAssetPreviewsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/sessions/{id}/tools/read-asset-previews'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetPreviewsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the internal readAssetPreviews agent tool
  ///
  /// Internal route for requesting or resuming a strict-approved preview read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetPreviewsToolRequestDto] agentReadAssetPreviewsToolRequestDto (required):
  Future<Object?> readAssetPreviews(String id, AgentReadAssetPreviewsToolRequestDto agentReadAssetPreviewsToolRequestDto,) async {
    final response = await readAssetPreviewsWithHttpInfo(id, agentReadAssetPreviewsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the runner listAlbums agent tool
  ///
  /// Internal runner gateway for executing an album list tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListAlbumsToolRequestDto] agentListAlbumsToolRequestDto (required):
  Future<Response> runnerListAlbumsWithHttpInfo(String id, AgentListAlbumsToolRequestDto agentListAlbumsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/internal/tools/sessions/{id}/list-albums'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentListAlbumsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the runner listAlbums agent tool
  ///
  /// Internal runner gateway for executing an album list tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentListAlbumsToolRequestDto] agentListAlbumsToolRequestDto (required):
  Future<Object?> runnerListAlbums(String id, AgentListAlbumsToolRequestDto agentListAlbumsToolRequestDto,) async {
    final response = await runnerListAlbumsWithHttpInfo(id, agentListAlbumsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the runner readAlbum agent tool
  ///
  /// Internal runner gateway for executing an album read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAlbumToolRequestDto] agentReadAlbumToolRequestDto (required):
  Future<Response> runnerReadAlbumWithHttpInfo(String id, AgentReadAlbumToolRequestDto agentReadAlbumToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/internal/tools/sessions/{id}/read-album'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAlbumToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the runner readAlbum agent tool
  ///
  /// Internal runner gateway for executing an album read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAlbumToolRequestDto] agentReadAlbumToolRequestDto (required):
  Future<Object?> runnerReadAlbum(String id, AgentReadAlbumToolRequestDto agentReadAlbumToolRequestDto,) async {
    final response = await runnerReadAlbumWithHttpInfo(id, agentReadAlbumToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the runner readAssetMetadata agent tool
  ///
  /// Internal runner gateway for executing a metadata read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetMetadataToolRequestDto] agentReadAssetMetadataToolRequestDto (required):
  Future<Response> runnerReadAssetMetadataWithHttpInfo(String id, AgentReadAssetMetadataToolRequestDto agentReadAssetMetadataToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/internal/tools/sessions/{id}/read-asset-metadata'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetMetadataToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the runner readAssetMetadata agent tool
  ///
  /// Internal runner gateway for executing a metadata read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetMetadataToolRequestDto] agentReadAssetMetadataToolRequestDto (required):
  Future<Object?> runnerReadAssetMetadata(String id, AgentReadAssetMetadataToolRequestDto agentReadAssetMetadataToolRequestDto,) async {
    final response = await runnerReadAssetMetadataWithHttpInfo(id, agentReadAssetMetadataToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the runner readAssetOriginals agent tool
  ///
  /// Internal runner gateway for executing an original read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetOriginalsToolRequestDto] agentReadAssetOriginalsToolRequestDto (required):
  Future<Response> runnerReadAssetOriginalsWithHttpInfo(String id, AgentReadAssetOriginalsToolRequestDto agentReadAssetOriginalsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/internal/tools/sessions/{id}/read-asset-originals'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetOriginalsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the runner readAssetOriginals agent tool
  ///
  /// Internal runner gateway for executing an original read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetOriginalsToolRequestDto] agentReadAssetOriginalsToolRequestDto (required):
  Future<Object?> runnerReadAssetOriginals(String id, AgentReadAssetOriginalsToolRequestDto agentReadAssetOriginalsToolRequestDto,) async {
    final response = await runnerReadAssetOriginalsWithHttpInfo(id, agentReadAssetOriginalsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the runner readAssetPreviews agent tool
  ///
  /// Internal runner gateway for executing a preview read tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetPreviewsToolRequestDto] agentReadAssetPreviewsToolRequestDto (required):
  Future<Response> runnerReadAssetPreviewsWithHttpInfo(String id, AgentReadAssetPreviewsToolRequestDto agentReadAssetPreviewsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/internal/tools/sessions/{id}/read-asset-previews'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentReadAssetPreviewsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the runner readAssetPreviews agent tool
  ///
  /// Internal runner gateway for executing a preview read tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentReadAssetPreviewsToolRequestDto] agentReadAssetPreviewsToolRequestDto (required):
  Future<Object?> runnerReadAssetPreviews(String id, AgentReadAssetPreviewsToolRequestDto agentReadAssetPreviewsToolRequestDto,) async {
    final response = await runnerReadAssetPreviewsWithHttpInfo(id, agentReadAssetPreviewsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }

  /// Execute the runner searchAssets agent tool
  ///
  /// Internal runner gateway for executing an asset search tool call for an AI agent session.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchAssetsToolRequestDto] agentSearchAssetsToolRequestDto (required):
  Future<Response> runnerSearchAssetsWithHttpInfo(String id, AgentSearchAssetsToolRequestDto agentSearchAssetsToolRequestDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/agent/internal/tools/sessions/{id}/search-assets'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = agentSearchAssetsToolRequestDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Execute the runner searchAssets agent tool
  ///
  /// Internal runner gateway for executing an asset search tool call for an AI agent session.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [AgentSearchAssetsToolRequestDto] agentSearchAssetsToolRequestDto (required):
  Future<Object?> runnerSearchAssets(String id, AgentSearchAssetsToolRequestDto agentSearchAssetsToolRequestDto,) async {
    final response = await runnerSearchAssetsWithHttpInfo(id, agentSearchAssetsToolRequestDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'Object',) as Object;
    
    }
    return null;
  }
}
