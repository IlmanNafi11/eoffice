<?php

namespace App\Support\Http;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Pagination\LengthAwarePaginator;
use Symfony\Component\HttpFoundation\Response;

final class ApiResponse
{
    public static function ok(mixed $data = null, ?string $message = null): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'message' => $message,
            'meta' => null,
        ]);
    }

    public static function created(mixed $data, string $message): JsonResponse
    {
        return response()->json([
            'success' => true,
            'data' => $data,
            'message' => $message,
        ], 201);
    }

    public static function deleted(): Response
    {
        return response()->noContent();
    }

    /**
     * @param  class-string<JsonResource>  $resource
     *
     * A typo'd resource FQCN used to be a runtime fatality in every list
     * endpoint; the guard turns it into a loud failure at the call site
     * (ship review R1).
     */
    public static function paginated(LengthAwarePaginator $page, string $resource): JsonResponse
    {
        if (! is_a($resource, JsonResource::class, true)) {
            throw new \InvalidArgumentException(
                "ApiResponse::paginated expects a JsonResource class-string, got [{$resource}]."
            );
        }

        $data = $resource::collection($page->items())->resolve();

        return response()->json([
            'success' => true,
            'data' => $data,
            'message' => null,
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
        ]);
    }

    public static function fail(string $message, int $status = 422, ?array $errors = null): JsonResponse
    {
        $body = [
            'success' => false,
            'message' => $message,
        ];

        if ($errors !== null) {
            $body['errors'] = $errors;
        }

        return response()->json($body, $status);
    }
}
