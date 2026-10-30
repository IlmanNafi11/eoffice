<?php

namespace App\Exceptions;

use App\Support\Http\ApiResponse;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Spatie\Permission\Exceptions\UnauthorizedException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

class Handler extends ExceptionHandler
{
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
        'code',
        'reset_token',
    ];

    public function register(): void
    {
        // Full trace into the log for 5xx only. internalDontReport covers the
        // framework's own client errors, but ApiException carries its own
        // status and is not in that list — without this check every domain 422
        // (a normal answer such as "only pending packages can be approved")
        // was logged as "Unhandled exception", training operators to ignore the
        // alert that matters.
        $this->reportable(function (Throwable $e) {
            if ($this->statusFor($e) < 500) {
                return false;
            }

            Log::error('Unhandled exception', ['exception' => $e]);

            return false;
        });
    }

    public function render($request, Throwable $e)
    {
        // API-only app: every API route and every JSON expectation renders the
        // error envelope; anything else falls back to the framework default.
        $this->shouldRenderJsonWhen(
            fn ($request) => $request->is('api/*') || $request->expectsJson(),
        );

        if (! $this->shouldReturnJson($request, $e)) {
            return parent::render($request, $e);
        }

        // Match on the ORIGINAL exception (before the framework's
        // prepareException() converts ModelNotFoundException to
        // NotFoundHttpException), so no path can leak the FQCN or id.
        $status = $this->statusFor($e);
        $message = $this->messageFor($e, $status);

        $response = ApiResponse::fail($message, $status, $this->errorsFor($e));

        // Preserve framework headers (Retry-After on 429, Allow on 405, ...).
        if ($e instanceof HttpExceptionInterface) {
            $response->headers->add($e->getHeaders());
        }

        return $this->withDebug($response, $e);
    }

    private function statusFor(Throwable $e): int
    {
        return match (true) {
            $e instanceof ApiException => $e->status(),
            $e instanceof ValidationException => 422,
            $e instanceof AuthenticationException => 401,
            $e instanceof AuthorizationException,
            $e instanceof UnauthorizedException => 403,
            $e instanceof ModelNotFoundException,
            $e instanceof NotFoundHttpException => 404,
            $e instanceof ThrottleRequestsException => 429,
            $e instanceof MethodNotAllowedHttpException => 405,
            $e instanceof HttpExceptionInterface => $e->getStatusCode(),
            default => 500,
        };
    }

    private function messageFor(Throwable $e, int $status): string
    {
        return match (true) {
            $e instanceof ApiException => $e->getMessage(),
            $e instanceof ValidationException => 'Data yang diberikan tidak valid.',
            $e instanceof AuthenticationException => 'Unauthenticated.',
            $e instanceof AuthorizationException,
            $e instanceof UnauthorizedException => 'Anda tidak memiliki izin untuk aksi ini.',
            $e instanceof ModelNotFoundException,
            $e instanceof NotFoundHttpException => 'Data tidak ditemukan.',
            $e instanceof ThrottleRequestsException => 'Terlalu banyak permintaan. Coba lagi nanti.',
            $e instanceof MethodNotAllowedHttpException => 'Metode tidak diizinkan.',
            $e instanceof HttpExceptionInterface => 'Permintaan tidak dapat diproses.',
            default => 'Terjadi kesalahan pada server.',
        };
    }

    private function errorsFor(Throwable $e): ?array
    {
        return match (true) {
            $e instanceof ApiException => $e->errors(),
            $e instanceof ValidationException => $e->errors(),
            default => null,
        };
    }

    /**
     * Debug details are exposed only when APP_DEBUG is true AND the
     * environment is not production; the class/message/file/line stay out of
     * logs-only territory otherwise (full trace goes to the log, never here).
     */
    private function withDebug(JsonResponse $response, Throwable $e): JsonResponse
    {
        // config('app.env') mirrors $app['env'] at runtime (both come from
        // APP_ENV) and stays testable without rebooting the container.
        if (config('app.debug') === true && config('app.env') !== 'production') {
            $data = $response->getData(true);
            $data['debug'] = [
                'class' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile().':'.$e->getLine(),
            ];
            $response->setData($data);
        }

        return $response;
    }
}
