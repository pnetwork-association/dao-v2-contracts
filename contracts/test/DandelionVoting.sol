// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

// Be sure to use this contract in a forked environment where the real implementation is already deployed
contract DandelionVoting {
    event StartVote(uint256 indexed voteId, address indexed creator, string metadata);

    uint64 public durationBlocks;

    function newVote(
        bytes calldata _executionScript,
        string calldata _metadata,
        bool _castVote
    ) external returns (uint256 voteId) {}

    function vote(uint256 _voteId, bool _supports) external {}

    function executeVote(uint256 _voteId) external {}

    function getVote(
        uint256 _voteId
    )
        public
        view
        returns (
            bool open,
            bool executed,
            uint64 startBlock,
            uint64 executionBlock,
            uint64 snapshotBlock,
            uint64 supportRequired,
            uint64 minAcceptQuorum,
            uint256 votingPower,
            uint256 yea,
            uint256 nay,
            bytes memory script
        )
    {}

    function getVoterState(uint256 _voteId, address _voter) public view {}

    function setPermissionManager(address _newManager, address _app, bytes32 _role) external {}

    function canVote(uint256 _voteId, address _voter) public view returns (bool) {}
}
