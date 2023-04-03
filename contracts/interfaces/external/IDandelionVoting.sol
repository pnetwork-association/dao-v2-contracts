// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IDandelionVoting {
    enum VoterState {
        Absent,
        Yea,
        Nay
    }

    function duration() external returns (uint64);

    function getVote(
        uint256 voteId
    ) external returns (bool, bool, uint64, uint64, uint64, uint64, uint64, uint256, uint256, uint256, bytes memory);

    function getVoterState(uint256 voteId, address beneficiary) external returns (VoterState);

    function votesLength() external returns (uint256);
}
