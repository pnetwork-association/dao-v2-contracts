// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

interface IDandelionVoting {
    enum VoterState {
        Absent,
        Yea,
        Nay
    }

    function duration() external returns (uint64);

    function getVote(
        uint256 voteId
    ) external returns (
            bool open,
            bool executed,
            uint64 startDate,
            uint64 executionDate,
            uint64 snapshotBlock,
            uint64 supportRequired,
            uint64 minAcceptQuorum,
            uint256 votingPower,
            uint256 yea,
            uint256 nay,
            bytes memory script
        );

    function getVoterState(uint256 voteId, address beneficiary) external returns (VoterState);

    function votesLength() external returns (uint256);
}
