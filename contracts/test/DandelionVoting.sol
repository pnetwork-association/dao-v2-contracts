// SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.17;

contract DandelionVoting {
    event StartVote(uint256 indexed voteId, address indexed creator, string metadata);

    uint64 public durationBlocks;
    address public forwarder;

    event CastVote(uint256 indexed voteId, address indexed voter, bool support);

    modifier onlyForwarded() {
        require(msg.sender == forwarder, "Invalid forwarder");
        _;
    }

    constructor(address _forwarder) {
        forwarder = _forwarder;
    }

    function newVote(
        bytes calldata _executionScript,
        string calldata _metadata,
        bool _castVote
    ) external returns (uint256 voteId) {}

    function vote(uint256 _voteId, bool _supports) external {}

    function delegateVote(address _voter, uint256 _voteId, bool _supports) external onlyForwarded {
        emit CastVote(_voteId, _voter, _supports);
    }

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

    function setForwarder(address _forwarder) external {
        forwarder = _forwarder;
    }
}
