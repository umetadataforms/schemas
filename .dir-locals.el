;;; Directory Local Variables -*- no-byte-compile: t -*-
;;; For more information see (info "(emacs) Directory Variables")

((nil . ((eval . (add-hook 'find-file-hook
                           (lambda ()
                             (when-let* ((file-name (buffer-file-name))
                                         (parent-dir (f-base (f-dirname file-name)))
                                         (base-name (f-filename file-name)))
                               (rename-buffer (format "%s/%s" parent-dir base-name) t)))
                           nil t)))))
