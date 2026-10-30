<?php

namespace App\Domains\ChangeManagement\Http\Requests;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;

class ChangePackageRules
{
    /**
     * Payload allowlist. Only these keys may reach the models; workflow state
     * (status, reviewer_id, review_*, *_signed_at, verification_token) is set
     * exclusively by transitionPackage()/ChangePackageDecision — never from
     * client input.
     *
     * @var list<string>
     */
    private const INITIATION_FIELDS = ['field_id', 'needed_by_date', 'description', 'reason'];

    /** @var list<string> */
    private const IMPLEMENTATION_FIELDS = [
        'priority',
        'impact',
        'production_impact',
        'required_effort',
        'cost_needed',
        'cost_amount',
        'resources',
        'test_plan',
        'execution_date',
        'release_date',
        'implementation_result',
        'review_response',
        'evaluator_id',
    ];

    /**
     * @return array<string, mixed>
     */
    public static function initiationPayload(Request $request): array
    {
        return array_intersect_key(
            (array) $request->input('initiation', []),
            array_flip(self::INITIATION_FIELDS),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public static function implementationPayload(Request $request): array
    {
        return array_intersect_key(
            (array) $request->input('implementation', []),
            array_flip(self::IMPLEMENTATION_FIELDS),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public static function typeIdsPayload(Request $request): array
    {
        return (array) $request->input('implementation.change_type_ids', []);
    }

    public static function initiationDraft(): array
    {
        return self::initiationRules(submit: false);
    }

    /** Rules for updating an existing package — field_id already set on the record. */
    public static function initiationUpdate(): array
    {
        return [
            'initiation' => ['sometimes', 'array'],
            'initiation.field_id' => ['sometimes', 'exists:fields,id'],
            'initiation.needed_by_date' => ['nullable', 'date'],
            'initiation.description' => ['required', 'string'],
            'initiation.reason' => ['required', 'string'],
        ];
    }

    public static function initiationSubmit(): array
    {
        return self::initiationRules(submit: true);
    }

    public static function implementationDraft(): array
    {
        return self::implementationRules(submit: false);
    }

    public static function implementationSubmit(): array
    {
        return self::implementationRules(submit: true);
    }

    /**
     * Reject workflow-state keys smuggled into a draft/update/submit payload.
     * These keys are not validated business data: accepting them would let a
     * client mint an approved-and-signed package without going through the
     * transition endpoints.
     *
     * @return array<string, list<string>>
     */
    public static function stateTamperingRules(): array
    {
        return [
            'initiation.status' => ['prohibited'],
            'initiation.initiator_id' => ['prohibited'],
            'initiation.doc_number' => ['prohibited'],
            'initiation.reviewer_id' => ['prohibited'],
            'initiation.review_status' => ['prohibited'],
            'initiation.reviewed_at' => ['prohibited'],
            'initiation.initiator_signed_at' => ['prohibited'],
            'initiation.verification_token' => ['prohibited'],
            'implementation.change_initiation_id' => ['prohibited'],
            'implementation.status' => ['prohibited'],
            'implementation.reviewer_id' => ['prohibited'],
            'implementation.responsible_id' => ['prohibited'],
            'implementation.review_status' => ['prohibited'],
            'implementation.reviewer_signed_at' => ['prohibited'],
            'implementation.responsible_signed_at' => ['prohibited'],
            'implementation.evaluator_signed_at' => ['prohibited'],
        ];
    }

    private static function initiationRules(bool $submit): array
    {
        return array_merge(self::stateTamperingRules(), [
            'initiation' => ['required', 'array'],
            'initiation.field_id' => ['required', 'exists:fields,id'],
            'initiation.needed_by_date' => [$submit ? 'required' : 'nullable', 'date'],
            'initiation.description' => ['required', 'string'],
            'initiation.reason' => ['required', 'string'],
        ]);
    }

    private static function implementationRules(bool $submit): array
    {
        $presence = $submit ? 'required' : 'nullable';

        return array_merge(self::stateTamperingRules(), [
            'implementation' => [$presence, 'array'],
            'implementation.priority' => [$presence, 'string', 'in:normal,emergency'],
            'implementation.impact' => [$presence, 'string', 'in:Minor,Mayor'],
            'implementation.production_impact' => ['nullable', 'string'],
            'implementation.required_effort' => ['nullable', 'string'],
            'implementation.cost_needed' => ['nullable', 'boolean'],
            'implementation.cost_amount' => ['nullable', 'numeric', 'required_if:implementation.cost_needed,1,true,on,yes'],
            'implementation.resources' => ['nullable', 'string'],
            'implementation.test_plan' => [$presence, 'string'],
            'implementation.change_type_ids' => $submit
                ? ['required', 'array', 'min:1']
                : ['nullable', 'array'],
            'implementation.change_type_ids.*' => ['exists:change_types,id'],
            'implementation.execution_date' => [$presence, 'date'],
            'implementation.release_date' => [$presence, 'date', function (string $attribute, mixed $value, Closure $fail) {
                if ($value === null) {
                    return;
                }
                $executionDate = request()->input('implementation.execution_date');
                if ($executionDate === null) {
                    return;
                }
                if ($value < $executionDate) {
                    $fail('Tanggal rilis harus setelah atau sama dengan tanggal eksekusi.');
                }
            }],
            'implementation.implementation_result' => [$presence, 'string'],
            'implementation.review_response' => ['nullable', 'string'],
            'implementation.evaluator_id' => self::evaluatorRule(),
        ]);
    }

    /** @return array<int, mixed> */
    private static function evaluatorRule(): array
    {
        return [
            'nullable',
            'integer',
            'exists:users,id',
            function (string $attribute, mixed $value, Closure $fail) {
                if (! $value || ! request()->user() || $value === request()->user()->id) {
                    return;
                }

                $evaluator = User::with('team')->find($value);

                if (! $evaluator?->is_active) {
                    $fail('Evaluator tidak ditemukan atau tidak aktif.');

                    return;
                }

                $creatorFieldId = request()->user()->team?->field_id;
                $evaluatorFieldId = $evaluator->team?->field_id;

                if ($creatorFieldId !== $evaluatorFieldId) {
                    $fail('Evaluator harus berada dalam bidang yang sama.');
                }
            },
        ];
    }
}
