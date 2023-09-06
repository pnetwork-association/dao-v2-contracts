// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IGovernanceMessageEmitter {
    function hardResumeSentinel(address sentinel, address[] calldata sentinels) external;

    function lightResumeSentinel(address actor) external;

    function propagateSentinelsByRemovingTheLeafByProof(bytes32[] calldata proof) external;
}
