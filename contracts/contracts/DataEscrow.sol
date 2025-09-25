// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private status;

    constructor() {
        status = NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(status != ENTERED, "reentrancy");
        status = ENTERED;
        _;
        status = NOT_ENTERED;
    }
}

contract DataEscrow is ReentrancyGuard {
    address public owner; // platform admin/oracle (ideally multisig)
    address public feeRecipient; // platform fee receiver
    uint256 public feeBps; // basis points (1% = 100)

    struct Escrow {
        address payer;      // buyer
        address payee;      // user to be paid on release
        address token;      // address(0) for native; ERC-20 otherwise
        uint256 amount;     // total amount deposited
        bool released;      // funds released
        bool refunded;      // funds refunded
        uint64  createdAt;  // timestamp for optional timeouts
    }

    mapping(bytes32 => Escrow) public escrows; // escrowId => Escrow

    event Deposited(bytes32 indexed id, address indexed payer, address indexed payee, address token, uint256 amount);
    event Released(bytes32 indexed id, address indexed payee, uint256 netAmount, uint256 fee);
    event Refunded(bytes32 indexed id, address indexed payer, uint256 amount);
    event FeeUpdated(uint256 feeBps, address feeRecipient);
    event OwnerUpdated(address newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    constructor(address _owner, address _feeRecipient, uint256 _feeBps) {
        require(_owner != address(0), "owner=0");
        owner = _owner;
        feeRecipient = _feeRecipient;
        feeBps = _feeBps; // e.g., 250 = 2.5%
        emit FeeUpdated(feeBps, feeRecipient);
        emit OwnerUpdated(owner);
    }

    // Buyer deposits native token escrow
    function depositNative(bytes32 id, address payee) external payable nonReentrant {
        require(msg.value > 0, "zero deposit");
        _createEscrow(id, msg.sender, payee, address(0), msg.value);
    }

    // Buyer deposits ERC-20 escrow (requires prior approve)
    function depositERC20(bytes32 id, address payee, address token, uint256 amount) external nonReentrant {
        require(token != address(0), "token=0");
        require(amount > 0, "zero deposit");
        _createEscrow(id, msg.sender, payee, token, amount);
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "transferFrom fail");
    }

    function _createEscrow(bytes32 id, address payer, address payee, address token, uint256 amount) internal {
        Escrow storage e = escrows[id];
        require(e.amount == 0, "exists");
        require(payee != address(0), "payee=0");
        escrows[id] = Escrow({
            payer: payer,
            payee: payee,
            token: token,
            amount: amount,
            released: false,
            refunded: false,
            createdAt: uint64(block.timestamp)
        });
        emit Deposited(id, payer, payee, token, amount);
    }

    // Owner releases funds to payee after verification
    function release(bytes32 id) external onlyOwner nonReentrant {
        Escrow storage e = escrows[id];
        require(e.amount > 0, "not found");
        require(!e.released && !e.refunded, "done");

        uint256 fee = (e.amount * feeBps) / 10000;
        uint256 net = e.amount - fee;

        e.released = true;

        if (e.token == address(0)) {
            (bool s1, ) = payable(e.payee).call{value: net}("");
            require(s1, "payee xfer fail");
            if (fee > 0 && feeRecipient != address(0)) {
                (bool s2, ) = payable(feeRecipient).call{value: fee}("");
                require(s2, "fee xfer fail");
            }
        } else {
            require(IERC20(e.token).transfer(e.payee, net), "erc20 payee fail");
            if (fee > 0 && feeRecipient != address(0)) {
                require(IERC20(e.token).transfer(feeRecipient, fee), "erc20 fee fail");
            }
        }
        emit Released(id, e.payee, net, fee);
    }

    // Owner refunds payer
    function refund(bytes32 id) external onlyOwner nonReentrant {
        Escrow storage e = escrows[id];
        require(e.amount > 0, "not found");
        require(!e.released && !e.refunded, "done");
        e.refunded = true;
        if (e.token == address(0)) {
            (bool s, ) = payable(e.payer).call{value: e.amount}("");
            require(s, "refund fail");
        } else {
            require(IERC20(e.token).transfer(e.payer, e.amount), "erc20 refund fail");
        }
        emit Refunded(id, e.payer, e.amount);
    }

    // Admin
    function setFee(uint256 _feeBps, address _feeRecipient) external onlyOwner {
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        emit FeeUpdated(feeBps, feeRecipient);
    }

    function setOwner(address _owner) external onlyOwner {
        require(_owner != address(0), "owner=0");
        owner = _owner;
        emit OwnerUpdated(owner);
    }

    // Emergency withdraw of stray funds
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        require(to != address(0), "to=0");
        if (token == address(0)) {
            (bool s, ) = payable(to).call{value: amount}("");
            require(s, "withdraw fail");
        } else {
            require(IERC20(token).transfer(to, amount), "erc20 withdraw fail");
        }
    }
}


