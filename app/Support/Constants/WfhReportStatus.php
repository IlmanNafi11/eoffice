<?php

namespace App\Support\Constants;

/**
 * The WFH report status vocabulary, shared by validation rules and queries so
 * the enum cannot drift between the personal-report board and the team report
 * list (both filter on the same column).
 */
final class WfhReportStatus
{
    public const DRAFT = 'draft';

    public const PENDING = 'pending';

    public const APPROVED = 'approved';

    public const REJECTED = 'rejected';

    /** @return list<string> */
    public const ALL = [self::DRAFT, self::PENDING, self::APPROVED, self::REJECTED];

    /**
     * Statuses that count as a live report for a team report date. A rejected
     * report is never "live" (no-revision flow: it may coexist with a fresh
     * one, and the fresh one wins).
     *
     * @return list<string>
     */
    public const LIVE = [self::PENDING, self::APPROVED];

    /**
     * Statuses that lock a (user, report_date): at most one report in one of
     * these states may exist per user and date (enforced by the partial
     * unique index `wfh_reports_active_draft_unique`). A rejected report is
     * terminal and the only state that reopens the date for a correction.
     *
     * @return list<string>
     */
    public const ACTIVE = [self::DRAFT, self::PENDING, self::APPROVED];
}
