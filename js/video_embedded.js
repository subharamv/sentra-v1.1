$(function () {
    const $openModalButtons = $('.request-loader');
    const $overlay = $('#modal-overlay');
    const $closeModal = $('.my-close, .modal-close');
    
    // Support both iframe ID variants
    let $videoFrame = $('#my-video-frame');
    if ($videoFrame.length === 0) {
        $videoFrame = $('#modal-video-frame');
    }

    $openModalButtons.on('click', function () {
        const videoUrl = $(this).attr('data-video');
        const separator = videoUrl.includes('?') ? '&' : '?';
        $videoFrame.attr('src', videoUrl + separator + "rel=0");
        $overlay.css('display', 'flex');
    });

    $closeModal.on('click', function () {
        $overlay.hide();
        $videoFrame.attr('src', "");
    });

    $overlay.on('click', function (e) {
        if (e.target === this) {
            $overlay.hide();
            $videoFrame.attr('src', "");
        }
    });
});