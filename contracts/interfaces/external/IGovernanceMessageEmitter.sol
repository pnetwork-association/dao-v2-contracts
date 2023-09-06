// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IGovernanceMessageEmitter {
    function hardResumeSentinel(address sentinel, address[] calldata sentinels) external;

    function hardSlashSentinel(address sentinel, bytes32[] calldata proof) external;

    function lightResumeSentinel(address actor) external;
}
