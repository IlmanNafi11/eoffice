<?php

namespace App\Providers;

use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Http\Events\RequestHandled;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Exceptions are rendered after the middleware pipeline unwinds, so
        // error responses bypass SecurityHeaders. RequestHandled fires for
        // every response — including rendered exceptions — giving a final
        // pass that guarantees the headers on all API responses.
        $this->app['events']->listen(RequestHandled::class, function (RequestHandled $event): void {
            SecurityHeaders::apply($event->response);
        });
    }
}
