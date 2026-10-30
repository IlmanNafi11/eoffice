<?php

return [

    /*
    |----------------------------------------------------------------------
    | Change Management Configuration
    |----------------------------------------------------------------------
    |
    | Document number prefix for change-initiation documents. Read via
    | config(), never env() directly, so config:cache keeps working.
    |
    */

    'doc_prefix' => env('CHANGE_DOC_PREFIX', '9/1.1/114'),
];
