// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IGovernanceMessageEmitter {
    function resumeGuardian(address guardian) external;

    function resumeSentinel(address sentinel) external;

    function slashGuardian(address guardian) external;

    function slashSentinel(address sentinel) external;

    function propagateActors(address[] calldata sentinels, address[] calldata guardians) external;

    function propagateGuardians(address[] calldata guardians) external;

    function propagateSentinels(address[] calldata sentinels) external;
}
