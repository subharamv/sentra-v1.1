<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $email = htmlspecialchars(trim($_POST['newsletter-email']));

    if (empty($email)) {
        echo "Email is required!";
        exit;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo "Invalid email format!";
        exit;
    }



    $to = "sentra@clovetech.com";
    $subject = "New Newsletter Subscription";
    $message = "New subscriber: $email";
    $headers = "From: noreply@clovetech.com\r\n";
    $headers .= "Reply-To: noreply@clovetech.com\r\n";

    if (mail($to, $subject, $message, $headers)) {
        echo "Thank you for subscribing!";
    } else {
        echo "Failed to subscribe. Please try again.";
    }
} else {
    echo "Invalid request!";
}
?>