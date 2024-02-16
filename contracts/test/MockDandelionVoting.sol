// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.17;

contract MockDandelionVotingContract {
    struct Vote {
        mapping(address => uint256) votersState;
        uint64 startDate;
        uint64 snapshotBlock;
    }
    mapping(uint256 => Vote) private _votes;
    uint256 id;

    function setTestVoteState(uint256 voteId, address voter, uint256 state) external {
        _votes[voteId].votersState[voter] = state;
    }

    function newVote() external {
        uint256 newId = ++id;
        _votes[newId].startDate = uint64(block.timestamp);
        _votes[newId].snapshotBlock = uint64(block.number);
    }

    function votesLength() external view returns (uint256) {
        return id;
    }

    function duration() public pure returns (uint64) {
        return 259200; // 3 days
    }

    // 0 values are just for testing since here we need to test if a lender voted to one or more votes within an epoch
    function getVote(
        uint256 voteId
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
        startDate = _votes[voteId].startDate;
        executionDate = _votes[voteId].startDate + duration();
        snapshotBlock = _votes[voteId].snapshotBlock;
        votingPower = 0;
        supportRequired = 0;
        minAcceptQuorum = 0;
        yea = 0;
        nay = 0;
        script = "";
    }

    function getVoterState(uint256 voteId, address voter) external view returns (uint256) {
        return _votes[voteId].votersState[voter];
    }
}
