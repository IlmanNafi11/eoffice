<?php

namespace Tests\Unit\Shared;

use App\Domains\Wfh\Services\Concerns\TransitionsReportState;
use App\Domains\Wfh\Services\TeamReportStateMachine;
use App\Domains\Wfh\Services\WfhReportStateMachine;
use ReflectionClass;
use ReflectionMethod;
use Tests\TestCase;

/**
 * The pending-guard, approve/reject transition, and verification-token
 * generation logic must live in exactly one definition: the
 * TransitionsReportState trait. Both WFH report state machines consume it
 * rather than declaring their own copies.
 */
class TransitionsReportStateTraitTest extends TestCase
{
    private const TRANSITION_METHODS = [
        'assertPending',
        'approveTransition',
        'rejectTransition',
        'ensureVerificationToken',
    ];

    public function test_trait_exists_and_declares_the_transition_logic(): void
    {
        $this->assertTrue(
            trait_exists(TransitionsReportState::class),
            'TransitionsReportState trait must exist.'
        );

        $trait = new ReflectionClass(TransitionsReportState::class);

        foreach (self::TRANSITION_METHODS as $method) {
            $this->assertTrue(
                $trait->hasMethod($method),
                "The trait must declare {$method}()."
            );
        }
    }

    public function test_both_state_machines_use_the_trait(): void
    {
        foreach ([WfhReportStateMachine::class, TeamReportStateMachine::class] as $machine) {
            $this->assertContains(
                TransitionsReportState::class,
                (new ReflectionClass($machine))->getTraitNames(),
                "{$machine} must use the TransitionsReportState trait."
            );
        }
    }

    public function test_transition_logic_is_declared_in_the_trait_only(): void
    {
        $traitFile = (new ReflectionClass(TransitionsReportState::class))->getFileName();

        foreach ([WfhReportStateMachine::class, TeamReportStateMachine::class] as $machine) {
            foreach (self::TRANSITION_METHODS as $method) {
                $this->assertSame(
                    $traitFile,
                    (new ReflectionMethod($machine, $method))->getFileName(),
                    "{$method}() on {$machine} must be defined in the trait."
                );
            }
        }
    }

    public function test_verification_token_generation_lives_only_in_the_trait(): void
    {
        $traitSource = file_get_contents(
            (new ReflectionClass(TransitionsReportState::class))->getFileName()
        );

        $this->assertStringContainsString(
            'bin2hex',
            $traitSource,
            'The trait must own verification-token generation.'
        );

        foreach ([WfhReportStateMachine::class, TeamReportStateMachine::class] as $machine) {
            $this->assertStringNotContainsString(
                'bin2hex',
                file_get_contents((new ReflectionClass($machine))->getFileName()),
                "{$machine} must not inline verification-token generation."
            );
        }
    }
}
