// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title IStakingManager
 * @author pNetwork
 *
 * @notice
 */
interface IStakingManager {
    struct Stake {
        uint256 amount;
        uint64 startDate;
        uint64 endDate;
    }

    /**
     * @dev Emitted when an user stakes some tokens
     *
     * @param receiver The receiver
     * @param amount The staked amount
     * @param duration The staking duration
     */
    event Staked(address indexed receiver, uint256 amount, uint64 duration);

    /**
     * @dev Emitted when an user unstakes some tokens
     *
     * @param owner The owner
     * @param amount The unstaked amount
     */
    event Unstaked(address indexed owner, uint256 amount);

    /*
     * @notice Stake an certain amount of tokens locked for a period of time in behalf of receiver.
     * in exchange of the governance token.
     *
     * @param amount
     * @param duration
     * @param receiver
     */
    function stake(uint256 amount, uint64 duration, address receiver) external;

    /*
     * @notice Returns the owner's stake data
     *
     * @param aowner
     *
     * @return the Stake struct representing the owner's stake data.
     */
    function stakeOf(address owner) external view returns (Stake memory);

    /*
     * @notice Unstake an certain amount of governance token in exchange of the same amount of staked tokens.
     *
     * @param amount
     *
     */
    function unstake(uint256 amount) external;
}
