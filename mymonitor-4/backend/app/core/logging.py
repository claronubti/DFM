import logging


def configure_logging() -> None:
    """Configure structured console logging format and default log levels."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(levelname)-5.5s [%(name)s] %(message)s",
    )

