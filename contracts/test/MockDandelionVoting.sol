// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.17;

contract MockDandelionVotingContract {
    uint64 private _testStartDate;
    uint64 private _testSnapshotBlock;
    mapping(address => uint256) private _testVoteState;

    function setTestVoteState(address voter, uint256 testVoteState_) external {
        _testVoteState[voter] = testVoteState_;
    }

    function setTestStartDate() external {
        _testStartDate = uint64(block.timestamp);
        _testSnapshotBlock = uint64(block.number);
    }

    function votesLength() external pure returns (uint256) {
        return 1;
    }

    function duration() public pure returns (uint64) {
        return 259200; // 3 days
    }

    // 0 values are just for testing since here we need to test if a lender voted to one or more votes within an epoch
    function getVote(
        uint256
    )
        external view
        returns (
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
        )
    {
        open = false;
        executed = true;
        startDate = _testStartDate;
        executionDate = _testStartDate + duration();
        snapshotBlock = _testSnapshotBlock;
        votingPower = 0;
        supportRequired = 0;
        minAcceptQuorum = 0;
        yea = 0;
        nay = 0;
        script = "";
    }

    function getVoterState(uint256, address voter) external view returns (uint256) {
        return _testVoteState[voter];
    }
}
