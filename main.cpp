/**
 * \file main.cpp
 *
 * \section LICENSE
 *
 * Copyright (C) 2015-2022 Thorsten Roth
 *
 * This file is part of StackAndConquer.
 *
 * StackAndConquer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * StackAndConquer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with StackAndConquer.  If not, see <https://www.gnu.org/licenses/>.
 *
 * \section DESCRIPTION
 * Main function, start application, loading translation.
 */

/** \mainpage
 * \section Introduction
 * StackAndConquer is a challenging tower conquest board game. Inspired by Mixtour.<br />
 * GitHub: https://github.com/ElTh0r0/stackandconquer
 */

#include <QApplication>
#include <QCommandLineParser>
#include <QDebug>
#include <QStandardPaths>
#include <QTextStream>
#include <QTime>

#include "./stackandconquer.h"

static QFile logfile;
static QTextStream out(&logfile);

void setupLogger(const QString &sDebugFilePath,
                 const QString &sAppName,
                 const QString &sVersion);

void LoggingHandler(QtMsgType type,
                    const QMessageLogContext &context,
                    const QString &sMsg);

auto main(int argc, char *argv[]) -> int {
  QApplication app(argc, argv);
  app.setApplicationName(QStringLiteral(APP_NAME));
  app.setApplicationVersion(QStringLiteral(APP_VERSION));
  app.setApplicationDisplayName(QStringLiteral(APP_NAME));
#if !defined(Q_OS_WIN) && !defined(Q_OS_MAC)
  app.setWindowIcon(
        QIcon::fromTheme(QStringLiteral("stackandconquer"),
                         QIcon(QStringLiteral(":/stackandconquer.png"))));
#if QT_VERSION >= QT_VERSION_CHECK(5, 7, 0)
  app.setDesktopFileName(QStringLiteral("com.github.elth0r0.stackandconquer"));
#endif
#endif

  static const QString FILEEXTSAVE(QStringLiteral(".stacksav"));
  static const QString FILEEXTBOARD(QStringLiteral(".stackboard"));
  static const QString FIELD_IN(QStringLiteral("0"));
  static const QString FIELD_OUT(QStringLiteral("#"));

  QCommandLineParser cmdparser;
  cmdparser.setApplicationDescription(QStringLiteral(APP_DESC));
  cmdparser.addHelpOption();
  cmdparser.addVersionOption();
  QCommandLineOption enableDebug(QStringLiteral("debug"),
                                 QStringLiteral("Enable debug mode"));
  cmdparser.addOption(enableDebug);
  cmdparser.addPositionalArgument(
        QStringLiteral("savegame"),
        QStringLiteral("Savegame file to be opened (*%1)").arg(FILEEXTSAVE));
  cmdparser.process(app);

  // Default share data path (Windows and debugging)
  QString sSharePath = app.applicationDirPath();
  // Standard installation path (Linux)
  QDir tmpDir(app.applicationDirPath() + "/../share/"
              + app.applicationName().toLower());
  if (!cmdparser.isSet(enableDebug) && tmpDir.exists()) {
    sSharePath = app.applicationDirPath() + "/../share/"
                 + app.applicationName().toLower();
  }
#if defined(Q_OS_OSX)
  sSharePath = app.applicationDirPath() + "/../Resources/";
#endif

  QStringList sListPaths = QStandardPaths::standardLocations(
                             QStandardPaths::AppLocalDataLocation);
  if (sListPaths.isEmpty()) {
    qCritical() << "Error while getting data standard path.";
    sListPaths << app.applicationDirPath();
  }
  const QDir userDataDir(sListPaths[0].toLower());

  // Create folder including possible parent directories (mkPATH)
  if (!userDataDir.exists()) {
    userDataDir.mkpath(userDataDir.absolutePath());
  }

  const QString sDebugFile(QStringLiteral("debug.log"));
  setupLogger(userDataDir.absolutePath() + "/" + sDebugFile,
              app.applicationName(), app.applicationVersion());

  if (cmdparser.isSet(enableDebug)) {
    qWarning() << "DEBUG mode enabled!";
  }

  StackAndConquer myStackAndConquer(sSharePath, userDataDir,
                                    FILEEXTSAVE.toLower(),
                                    FILEEXTBOARD.toLower(),
                                    FIELD_IN, FIELD_OUT,
                                    cmdparser.positionalArguments());
  myStackAndConquer.show();
  int nRet = app.exec();

  logfile.close();
  return nRet;
}

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------

void setupLogger(const QString &sDebugFilePath,
                 const QString &sAppName,
                 const QString &sVersion) {
  // Remove old debug file
  if (QFile(sDebugFilePath).exists()) {
    QFile(sDebugFilePath).remove();
  }

  // Create new file
  logfile.setFileName(sDebugFilePath);
  if (!logfile.open(QIODevice::WriteOnly)) {
    qWarning() << "Couldn't create logging file: " + sDebugFilePath;
  } else {
    qInstallMessageHandler(LoggingHandler);
  }

  qDebug() << sAppName + " v" + sVersion;
  qDebug() << "Compiled with Qt" << QT_VERSION_STR;
  qDebug() << "Qt runtime" <<  qVersion();
}

// ----------------------------------------------------------------------------
// ----------------------------------------------------------------------------

void LoggingHandler(QtMsgType type,
                    const QMessageLogContext &context,
                    const QString &sMsg) {
  QString sContext = sMsg + " (" +
                     QString::fromLatin1(context.file) + ":" +
                     QString::number(context.line) + ", " +
                     QString::fromLatin1(context.function) + ")";
  QString sTime(QTime::currentTime().toString());

  switch (type) {
    case QtDebugMsg:
      out << sTime << " Debug: " << sMsg << "\n";
      out.flush();
      break;
    case QtWarningMsg:
      out << sTime << " Warning: " << sContext << "\n";
      out.flush();
      break;
    case QtCriticalMsg:
      out << sTime << " Critical: " << sContext << "\n";
      out.flush();
      break;
    case QtFatalMsg:
      out << sTime << " Fatal: " << sContext << "\n";
      out.flush();
      logfile.close();
      abort();
    default:
      out << sTime << " OTHER INFO: " << sContext << "\n";
      out.flush();
      break;
  }
}
