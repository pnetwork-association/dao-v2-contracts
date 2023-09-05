// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IGovernanceMessageEmitter {
    function propagateSentinelsByRemovingTheLeafByProof(bytes32[] calldata proof) external;

    function resumeSentinel(address actor) external;
}
